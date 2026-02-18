"""Background job system for embedding generation"""
import logging
import asyncio
from typing import Optional, Dict
from datetime import datetime
from bson import ObjectId

from app.database import get_db
from app.services.cloudinary_service import CloudinaryService
from app.services.embedding_service import EmbeddingGenerator, FaceDetectionError

logger = logging.getLogger(__name__)

# Global job tracking (in production, use Redis)
embedding_jobs = {}


class EmbeddingJobTracker:
    """Tracks embedding generation jobs"""
    
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.total = 0
        self.processed = 0
        self.successful = 0
        self.failed = 0
        self.running = True
        self.started_at = datetime.utcnow()
        self.completed_at = None
        self.errors = []
    
    def get_status(self) -> Dict:
        """Get current job status"""
        return {
            "job_id": self.job_id,
            "total": self.total,
            "processed": self.processed,
            "successful": self.successful,
            "failed": self.failed,
            "running": self.running,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "progress_percent": round((self.processed / self.total * 100) if self.total > 0 else 0, 2)
        }


class BackgroundEmbeddingService:
    """Service for background embedding generation"""
    
    @staticmethod
    async def generate_embeddings_for_all_students(job_id: str) -> None:
        """
        Generate embeddings for all students with images
        
        Args:
            job_id: Job tracking ID
        """
        job = embedding_jobs.get(job_id)
        if not job:
            logger.error(f"Job {job_id} not found")
            return
        
        try:
            db = get_db()
            student_collection = db["students"]
            
            # Get all students with images but no embedding
            students = list(student_collection.find({
                "profile_image_url": {"$exists": True, "$ne": None}
            }))
            
            job.total = len(students)
            job.processed = 0
            job.successful = 0
            job.failed = 0
            
            logger.info(f"Job {job_id}: Starting embedding generation for {job.total} students")
            
            for student in students:
                try:
                    student_id = str(student["_id"])
                    image_url = student.get("profile_image_url")
                    
                    if not image_url:
                        job.failed += 1
                        job.processed += 1
                        continue
                    
                    # Download image from Cloudinary
                    pil_image = CloudinaryService.get_image_pil(image_url)
                    if not pil_image:
                        student_collection.update_one(
                            {"_id": ObjectId(student_id)},
                            {
                                "$set": {
                                    "embedding_status": "failed",
                                    "updated_at": datetime.utcnow()
                                }
                            }
                        )
                        job.failed += 1
                        job.processed += 1
                        continue
                    
                    # Generate embedding
                    embedding, status = EmbeddingGenerator.generate_embedding_from_image(pil_image)
                    
                    if status == "generated" and embedding:
                        # Update student with embedding
                        student_collection.update_one(
                            {"_id": ObjectId(student_id)},
                            {
                                "$set": {
                                    "face_embedding": embedding,
                                    "embedding_model": "VGGFace2",
                                    "embedding_generated_at": datetime.utcnow(),
                                    "embedding_status": "generated",
                                    "updated_at": datetime.utcnow()
                                }
                            }
                        )
                        job.successful += 1
                    else:
                        # Update with failed status
                        student_collection.update_one(
                            {"_id": ObjectId(student_id)},
                            {
                                "$set": {
                                    "embedding_status": "failed",
                                    "updated_at": datetime.utcnow()
                                }
                            }
                        )
                        job.failed += 1
                    
                    job.processed += 1
                    
                    # Log progress every 10 students
                    if job.processed % 10 == 0:
                        logger.info(f"Job {job_id}: Processed {job.processed}/{job.total}")
                    
                    # Small delay to avoid overwhelming resources
                    await asyncio.sleep(0.1)
                    
                except Exception as e:
                    logger.error(f"Error processing student {student.get('student_id')}: {str(e)}")
                    job.failed += 1
                    job.processed += 1
            
            job.running = False
            job.completed_at = datetime.utcnow()
            logger.info(f"Job {job_id}: Completed. Successful: {job.successful}, Failed: {job.failed}")
            
        except Exception as e:
            logger.error(f"Job {job_id} failed: {str(e)}")
            job.running = False
            job.completed_at = datetime.utcnow()
            job.errors.append(str(e))
    
    @staticmethod
    async def generate_embeddings_for_missing(job_id: str) -> None:
        """
        Generate embeddings only for students missing embeddings
        
        Args:
            job_id: Job tracking ID
        """
        job = embedding_jobs.get(job_id)
        if not job:
            logger.error(f"Job {job_id} not found")
            return
        
        try:
            db = get_db()
            student_collection = db["students"]
            
            # Get students with images but no embedding
            students = list(student_collection.find({
                "profile_image_url": {"$exists": True, "$ne": None},
                "$or": [
                    {"face_embedding": {"$exists": False}},
                    {"face_embedding": None}
                ]
            }))
            
            job.total = len(students)
            job.processed = 0
            job.successful = 0
            job.failed = 0
            
            logger.info(f"Job {job_id}: Starting embedding generation for {job.total} students (missing embeddings)")
            
            for student in students:
                try:
                    student_id = str(student["_id"])
                    image_url = student.get("profile_image_url")
                    
                    if not image_url:
                        job.failed += 1
                        job.processed += 1
                        continue
                    
                    # Download image from Cloudinary
                    pil_image = CloudinaryService.get_image_pil(image_url)
                    if not pil_image:
                        student_collection.update_one(
                            {"_id": ObjectId(student_id)},
                            {
                                "$set": {
                                    "embedding_status": "failed",
                                    "updated_at": datetime.utcnow()
                                }
                            }
                        )
                        job.failed += 1
                        job.processed += 1
                        continue
                    
                    # Generate embedding
                    embedding, status = EmbeddingGenerator.generate_embedding_from_image(pil_image)
                    
                    if status == "generated" and embedding:
                        # Update student with embedding
                        student_collection.update_one(
                            {"_id": ObjectId(student_id)},
                            {
                                "$set": {
                                    "face_embedding": embedding,
                                    "embedding_model": "VGGFace2",
                                    "embedding_generated_at": datetime.utcnow(),
                                    "embedding_status": "generated",
                                    "updated_at": datetime.utcnow()
                                }
                            }
                        )
                        job.successful += 1
                    else:
                        # Update with failed status
                        student_collection.update_one(
                            {"_id": ObjectId(student_id)},
                            {
                                "$set": {
                                    "embedding_status": "failed",
                                    "updated_at": datetime.utcnow()
                                }
                            }
                        )
                        job.failed += 1
                    
                    job.processed += 1
                    
                    # Log progress every 10 students
                    if job.processed % 10 == 0:
                        logger.info(f"Job {job_id}: Processed {job.processed}/{job.total}")
                    
                    # Small delay to avoid overwhelming resources
                    await asyncio.sleep(0.1)
                    
                except Exception as e:
                    logger.error(f"Error processing student {student.get('student_id')}: {str(e)}")
                    job.failed += 1
                    job.processed += 1
            
            job.running = False
            job.completed_at = datetime.utcnow()
            logger.info(f"Job {job_id}: Completed. Successful: {job.successful}, Failed: {job.failed}")
            
        except Exception as e:
            logger.error(f"Job {job_id} failed: {str(e)}")
            job.running = False
            job.completed_at = datetime.utcnow()
            job.errors.append(str(e))
    
    @staticmethod
    def start_embedding_job(job_type: str) -> str:
        """
        Start a new embedding generation job
        
        Args:
            job_type: "all" or "missing"
            
        Returns:
            Job ID
        """
        import uuid
        job_id = str(uuid.uuid4())
        
        job = EmbeddingJobTracker(job_id)
        embedding_jobs[job_id] = job
        
        # Schedule background task
        if job_type == "all":
            asyncio.create_task(BackgroundEmbeddingService.generate_embeddings_for_all_students(job_id))
        elif job_type == "missing":
            asyncio.create_task(BackgroundEmbeddingService.generate_embeddings_for_missing(job_id))
        
        logger.info(f"Started embedding job {job_id} of type {job_type}")
        return job_id
    
    @staticmethod
    def get_job_status(job_id: str) -> Optional[Dict]:
        """
        Get status of embedding job
        
        Args:
            job_id: Job ID
            
        Returns:
            Job status or None if not found
        """
        job = embedding_jobs.get(job_id)
        if job:
            return job.get_status()
        return None
    
    @staticmethod
    def cleanup_old_jobs(max_age_minutes: int = 60) -> None:
        """
        Clean up completed jobs older than max_age_minutes
        
        Args:
            max_age_minutes: Maximum age in minutes
        """
        now = datetime.utcnow()
        to_delete = []
        
        for job_id, job in embedding_jobs.items():
            if not job.running and job.completed_at:
                age = (now - job.completed_at).total_seconds() / 60
                if age > max_age_minutes:
                    to_delete.append(job_id)
        
        for job_id in to_delete:
            del embedding_jobs[job_id]
            logger.info(f"Cleaned up job {job_id}")
