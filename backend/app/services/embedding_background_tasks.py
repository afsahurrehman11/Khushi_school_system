"""
Background Task System for Automatic Embedding Generation

This module handles automatic face embedding generation when images are uploaded.
Uses FastAPI's background task system to process embeddings asynchronously.
"""
import logging
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime
from bson import ObjectId

from app.database import get_db
from app.services.image_service import ImageService
from app.services.embedding_service import EmbeddingGenerator, FaceDetectionError

logger = logging.getLogger(__name__)


class EmbeddingBackgroundTask:
    """Handles background embedding generation for students and teachers"""
    
    @staticmethod
    async def generate_embedding_for_person(
        person_id: str,
        person_type: str,  # 'student' or 'teacher'
        school_id: str,
        image_blob: str
    ) -> None:
        """
        Generate face embedding in background after image upload
        
        Args:
            person_id: MongoDB ObjectId as string
            person_type: 'student' or 'teacher'
            school_id: School ID for logging
            image_blob: Base64 encoded image data
        """
        try:
            # Log start
            logger.info(f"🔄 [BG-EMBEDDING] Starting background embedding generation for {person_type} {person_id}")
            
            # Small delay to ensure database transaction is committed
            await asyncio.sleep(0.5)
            
            # Get database connection
            db = get_db()
            if db is None:
                logger.error(f"❌ [BG-EMBEDDING] Database unavailable for {person_type} {person_id}")
                return
            
            # Select collection based on person type
            collection_name = "students" if person_type == "student" else "teachers"
            collection = db[collection_name]
            
            # Verify person exists
            person = collection.find_one({"_id": ObjectId(person_id), "school_id": school_id})
            if not person:
                logger.error(f"❌ [BG-EMBEDDING] Person not found: {person_type} {person_id}")
                return
            
            # Get person display name and ID
            if person_type == "student":
                display_name = person.get("full_name", "Unknown")
                reg_id = person.get("student_id", person_id)
            else:
                display_name = person.get("name", "Unknown")
                reg_id = person.get("teacher_id", person_id)
            
            logger.info(f"📸 [BG-EMBEDDING] Processing: {display_name} ({reg_id})")
            
            # Convert base64 to PIL Image
            pil_image = ImageService.get_pil_image_from_base64(image_blob)
            if not pil_image:
                logger.error(f"❌ [BG-EMBEDDING] Failed to decode image for {reg_id}")
                collection.update_one(
                    {"_id": ObjectId(person_id)},
                    {
                        "$set": {
                            "embedding_status": "failed",
                            "embedding_error": "Failed to decode image",
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                return
            
            # Generate embedding
            logger.info(f"🧠 [BG-EMBEDDING] Generating embedding for {reg_id}...")
            embedding, status = EmbeddingGenerator.generate_embedding_from_image(pil_image)
            
            if status == "generated" and embedding:
                # Successfully generated embedding
                collection.update_one(
                    {"_id": ObjectId(person_id)},
                    {
                        "$set": {
                            "face_embedding": embedding,
                            "embedding_model": EmbeddingGenerator.EMBEDDING_MODEL,
                            "embedding_dimension": EmbeddingGenerator.EMBEDDING_DIMENSION,
                            "embedding_generated_at": datetime.utcnow(),
                            "embedding_status": "generated",
                            "embedding_error": None,
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                logger.info(f"✅ [BG-EMBEDDING] Successfully generated embedding for {display_name} ({reg_id})")
                logger.info(f"   📊 Model: {EmbeddingGenerator.EMBEDDING_MODEL}, Dimension: {EmbeddingGenerator.EMBEDDING_DIMENSION}")
                
            else:
                # Failed to generate embedding
                error_msg = "No face detected" if status == "no_face" else "Generation failed"
                collection.update_one(
                    {"_id": ObjectId(person_id)},
                    {
                        "$set": {
                            "embedding_status": "failed",
                            "embedding_error": error_msg,
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                logger.warning(f"⚠️ [BG-EMBEDDING] Embedding generation failed for {reg_id}: {error_msg}")
                
        except FaceDetectionError as e:
            logger.warning(f"⚠️ [BG-EMBEDDING] No face detected for {person_type} {person_id}: {str(e)}")
            try:
                db = get_db()
                if db:
                    collection_name = "students" if person_type == "student" else "teachers"
                    db[collection_name].update_one(
                        {"_id": ObjectId(person_id)},
                        {
                            "$set": {
                                "embedding_status": "failed",
                                "embedding_error": "No face detected in image",
                                "updated_at": datetime.utcnow()
                            }
                        }
                    )
            except Exception:
                pass
                
        except Exception as e:
            logger.error(f"❌ [BG-EMBEDDING] Unexpected error for {person_type} {person_id}: {str(e)}", exc_info=True)
            try:
                db = get_db()
                if db:
                    collection_name = "students" if person_type == "student" else "teachers"
                    db[collection_name].update_one(
                        {"_id": ObjectId(person_id)},
                        {
                            "$set": {
                                "embedding_status": "failed",
                                "embedding_error": str(e),
                                "updated_at": datetime.utcnow()
                            }
                        }
                    )
            except Exception:
                pass
    
    @staticmethod
    async def regenerate_embedding_for_person(
        person_id: str,
        person_type: str,
        school_id: str
    ) -> Dict[str, Any]:
        """
        Regenerate embedding for an existing person (when image is re-uploaded)
        
        Args:
            person_id: MongoDB ObjectId as string
            person_type: 'student' or 'teacher'
            school_id: School ID
            
        Returns:
            Dict with status and message
        """
        try:
            db = get_db()
            if db is None:
                return {"success": False, "error": "Database unavailable"}
            
            collection_name = "students" if person_type == "student" else "teachers"
            collection = db[collection_name]
            
            # Get person with image
            person = collection.find_one(
                {"_id": ObjectId(person_id), "school_id": school_id},
                {"profile_image_blob": 1, "full_name": 1, "name": 1, "student_id": 1, "teacher_id": 1}
            )
            
            if not person:
                return {"success": False, "error": "Person not found"}
            
            image_blob = person.get("profile_image_blob")
            if not image_blob:
                return {"success": False, "error": "No profile image available"}
            
            # Mark as pending and trigger background generation
            collection.update_one(
                {"_id": ObjectId(person_id)},
                {
                    "$set": {
                        "embedding_status": "pending",
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Generate in background
            asyncio.create_task(
                EmbeddingBackgroundTask.generate_embedding_for_person(
                    person_id=person_id,
                    person_type=person_type,
                    school_id=school_id,
                    image_blob=image_blob
                )
            )
            
            return {
                "success": True,
                "message": "Embedding generation started in background"
            }
            
        except Exception as e:
            logger.error(f"Error initiating embedding regeneration: {str(e)}")
            return {"success": False, "error": str(e)}


async def preload_models_at_startup() -> Dict[str, Any]:
    """
    Preload ML models at server startup to cache them in memory
    
    This ensures models are ready for immediate use and prevents cold-start delays.
    Called during FastAPI startup event.
    
    Returns:
        Dict with preload status
    """
    try:
        logger.info("=" * 60)
        logger.info("🚀 [STARTUP] Preloading face recognition models...")
        logger.info("=" * 60)
        
        # Initialize ONNX model by calling the init function
        from app.services.embedding_service import _init_arcface

        success = _init_arcface()
        
        if success:
            logger.info("✅ [STARTUP] ArcFace ResNet100 ONNX model loaded successfully")
            logger.info(f"   📦 Model: {EmbeddingGenerator.EMBEDDING_MODEL}")
            logger.info(f"   📊 Embedding dimension: {EmbeddingGenerator.EMBEDDING_DIMENSION}")
            logger.info("   🎯 Face recognition system is ready!")
            return {
                "success": True,
                "model": EmbeddingGenerator.EMBEDDING_MODEL,
                "dimension": EmbeddingGenerator.EMBEDDING_DIMENSION
            }
        else:
            logger.warning("⚠️ [STARTUP] Failed to preload models - will load on first use")
            logger.warning("   Check that onnxruntime is installed: pip install onnxruntime")
            return {
                "success": False,
                "error": "Model initialization failed"
            }
            
    except Exception as e:
        logger.error(f"❌ [STARTUP] Model preload error: {str(e)}", exc_info=True)
        logger.warning("   Face recognition will use lazy loading")
        return {
            "success": False,
            "error": str(e)
        }
