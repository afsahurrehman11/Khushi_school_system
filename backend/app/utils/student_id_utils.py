"""
Student ID Generation Utilities
"""

from datetime import datetime
from pymongo.collection import Collection
from typing import Optional
import logging

logger = logging.getLogger(__name__)

def generate_student_id(admission_year: int, db_collection: Collection, school_id: str = None) -> str:
    """
    Generate a new student ID for manual creation with schoolId isolation.
    Format: <admission_year>-<incremental_id>
    Resets yearly per school.
    """
    try:
        # Build match query with schoolId if provided
        match_query = {"admission_year": admission_year, "student_id": {"$regex": f"^{admission_year}-"}}
        if school_id:
            match_query["school_id"] = school_id
            
        # Find the highest incremental ID for this year (within school)
        pipeline = [
            {"$match": match_query},
            {"$project": {
                "id_num": {
                    "$toInt": {
                        "$arrayElemAt": [{"$split": ["$student_id", "-"]}, 1]
                    }
                }
            }},
            {"$sort": {"id_num": -1}},
            {"$limit": 1}
        ]

        result = list(db_collection.aggregate(pipeline))
        if result:
            next_id = result[0]["id_num"] + 1
        else:
            next_id = 1

        student_id = f"{admission_year}-{next_id}"
        logger.debug(f"🆔 Generated student ID: {student_id} for school {school_id or 'N/A'}")
        return student_id
    except Exception as e:
        logger.error(f"❌ Failed to generate student ID: {str(e)}")
        raise

def generate_imported_student_id(excel_id: str) -> str:
    """
    Generate student ID for Excel import.
    Format: 0000-<cleaned_excel_id>
    Strips any non-numeric prefixes like 'REG' from the excel_id.
    """
    try:
        # Clean the excel_id by removing any non-numeric prefix
        # Extract only the numeric part (e.g., "REG1002" -> "1002")
        import re
        match = re.search(r'(\d+)$', excel_id.strip())
        if match:
            cleaned_id = match.group(1)
        else:
            # If no numbers found, use the original (shouldn't happen in normal cases)
            cleaned_id = excel_id.strip()

        student_id = f"0000-{cleaned_id}"
        logger.debug(f"📊 Generated imported student ID: {student_id} (from: {excel_id})")
        return student_id
    except Exception as e:
        logger.error(f"❌ Failed to generate imported student ID: {str(e)}")
        raise

def validate_student_id_uniqueness(student_id: str, db_collection: Collection, school_id: str = None, exclude_id: Optional[str] = None) -> bool:
    """
    Check if student_id is unique within a school.
    """
    try:
        query = {"student_id": student_id}
        if school_id:
            query["school_id"] = school_id
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        is_unique = db_collection.count_documents(query) == 0
        if not is_unique:
            logger.warning(f"⚠️ Student ID not unique: {student_id} in school {school_id or 'N/A'}")
        return is_unique
    except Exception as e:
        logger.error(f"❌ Failed to validate student ID uniqueness: {str(e)}")
        return False