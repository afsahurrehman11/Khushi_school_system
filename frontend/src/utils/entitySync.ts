// Entity Synchronization System
// Simple pub/sub system for cross-component entity updates

type EntityType = 'student' | 'teacher' | 'class' | 'subject';
type EventType = 'created' | 'updated' | 'deleted';

interface EntityEvent {
  type: EventType;
  entityType: EntityType;
  entityId: string;
  data?: any;
}

class EntitySync {
  private listeners: Map<string, Set<(event: EntityEvent) => void>> = new Map();

  subscribe(entityType: EntityType, callback: (event: EntityEvent) => void): () => void {
    const key = entityType;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  emit(event: EntityEvent): void {
    const key = event.entityType;
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('EntitySync: Error in listener callback:', error);
        }
      });
    }
  }

  // Convenience methods
  emitStudentCreated(studentId: string, data?: any): void {
    this.emit({ type: 'created', entityType: 'student', entityId: studentId, data });
  }

  emitStudentUpdated(studentId: string, data?: any): void {
    this.emit({ type: 'updated', entityType: 'student', entityId: studentId, data });
  }

  emitStudentDeleted(studentId: string): void {
    this.emit({ type: 'deleted', entityType: 'student', entityId: studentId });
  }

  emitTeacherCreated(teacherId: string, data?: any): void {
    this.emit({ type: 'created', entityType: 'teacher', entityId: teacherId, data });
  }

  emitTeacherUpdated(teacherId: string, data?: any): void {
    this.emit({ type: 'updated', entityType: 'teacher', entityId: teacherId, data });
  }

  emitTeacherDeleted(teacherId: string): void {
    this.emit({ type: 'deleted', entityType: 'teacher', entityId: teacherId });
  }

  emitClassCreated(classId: string, data?: any): void {
    this.emit({ type: 'created', entityType: 'class', entityId: classId, data });
  }

  emitClassUpdated(classId: string, data?: any): void {
    this.emit({ type: 'updated', entityType: 'class', entityId: classId, data });
  }

  emitClassDeleted(classId: string): void {
    this.emit({ type: 'deleted', entityType: 'class', entityId: classId });
  }

  emitSubjectCreated(subjectId: string, data?: any): void {
    this.emit({ type: 'created', entityType: 'subject', entityId: subjectId, data });
  }

  emitSubjectUpdated(subjectId: string, data?: any): void {
    this.emit({ type: 'updated', entityType: 'subject', entityId: subjectId, data });
  }

  emitSubjectDeleted(subjectId: string): void {
    this.emit({ type: 'deleted', entityType: 'subject', entityId: subjectId });
  }
}

// Global instance
export const entitySync = new EntitySync();

// React hook for subscribing to entity changes
import { useEffect } from 'react';

export function useEntitySync(
  entityType: EntityType,
  callback: (event: EntityEvent) => void
): void {
  useEffect(() => {
    const unsubscribe = entitySync.subscribe(entityType, callback);
    return unsubscribe;
  }, [entityType, callback]);
}