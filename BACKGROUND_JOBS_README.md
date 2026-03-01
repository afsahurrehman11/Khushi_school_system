# Background Job Processing for Fee Vouchers

## Overview

To handle large classes (40-50+ students) and avoid Heroku's 30-second timeout limit, we've implemented background job processing for bulk fee voucher generation.

## How It Works

### Architecture

1. **Job Creation**: When a user requests bulk vouchers for a large class, instead of generating them synchronously, a background job is created
2. **Background Processing**: A daemon thread processes the job asynchronously
3. **Status Polling**: Frontend polls the job status endpoint every second
4. **Result Download**: When complete, frontend automatically downloads the result

### Components

#### Backend

**voucher_job_service.py** - New service managing background jobs
- `create_voucher_job()` - Creates and starts a background job
- `get_job_status()` - Returns job status without heavy data
- `get_job_result()` - Returns the generated file bytes
- `_process_voucher_job()` - Background worker thread function
- `cleanup_old_jobs()` - Removes jobs older than 1 hour

**fee_vouchers.py** - New endpoints added:
- `POST /api/fees/vouchers/class/{class_id}/download-all/background` - Start ZIP generation job
- `POST /api/fees/vouchers/class/{class_id}/print-all/background` - Start combined PDF generation job
- `GET /api/fees/vouchers/jobs/{job_id}/status` - Check job status
- `GET /api/fees/vouchers/jobs/{job_id}/download` - Download completed result

#### Frontend

**FeePage.tsx** - Updated with background job support:
- Automatically uses background jobs for classes with >10 students
- Shows progress modal with percentage and spinner
- Polls job status every second
- Auto-downloads when complete

### Job Status Flow

```
pending → processing → completed
                    ↘ failed
```

**Job Status Fields:**
- `job_id` - Unique identifier
- `job_type` - 'zip' or 'pdf'
- `class_id` - Target class
- `status` - Current status
- `progress` - Percentage (0-100)
- `created_at` - Job creation time
- `completed_at` - Completion time
- `error` - Error message if failed
- `result_size` - Size of generated file in bytes

### Implementation Details

#### Threshold Logic

```typescript
const studentCount = (classData as any).student_count || 0;
const useBackgroundJob = studentCount > 10;
```

- **Small classes (≤10 students)**: Direct synchronous generation
- **Large classes (>10 students)**: Background job with polling

#### Progress Updates

Jobs report progress at different stages:
- **10%** - Job started
- **30%** - Database queried, beginning generation
- **100%** - Generation complete

#### Job Expiry

Background jobs are automatically cleaned up after 1 hour to prevent memory leaks.

## User Experience

### For Small Classes (≤10 students)
1. User clicks download/print icon
2. Brief "Loading..." notification
3. File downloads/opens immediately

### For Large Classes (>10 students)
1. User clicks download/print icon
2. "Generating vouchers... This may take a moment." notification
3. Progress modal appears showing:
   - Current status message
   - Progress bar (0-100%)
   - Spinner animation
   - "This may take a minute..." message
4. When complete:
   - ZIP downloads automatically, OR
   - PDF opens in new window for printing
5. Modal closes automatically

## Error Handling

### Job Failures
- Caught exceptions stored in job.error
- Frontend displays error to user
- Job marked as 'failed' status

### Timeout Protection
- Maximum polling: 120 seconds (120 attempts × 1 second)
- After timeout, shows user-friendly error
- Prevents infinite polling loops

### Network Issues
- Fetch errors caught and displayed
- Job retry possible by clicking button again

## Production Considerations

### Current Implementation (In-Memory)
- Jobs stored in Python dictionary with thread lock
- Works for single-server deployments
- Survives within application lifetime only

### Scaling Recommendations

For production with multiple servers or high load:

1. **Use Redis for Job Storage**
   ```python
   import redis
   redis_client = redis.Redis(host='localhost', port=6379, db=0)
   ```
   - Persistent across server restarts
   - Shared across multiple server instances
   - Built-in expiry support

2. **Use Celery or RQ for Task Queue**
   ```python
   from celery import Celery
   celery_app = Celery('vouchers', broker='redis://localhost:6379/0')
   
   @celery_app.task
   def generate_vouchers_task(class_id, school_id):
       # Background processing
   ```
   - Better monitoring and management
   - Retry logic built-in
   - Worker process isolation

3. **Add WebSocket for Real-Time Updates**
   - Eliminate polling overhead
   - Instant progress updates
   - Better user experience

## Testing

### Manual Testing Steps

1. **Small Class Test (Direct)**
   - Create a class with 5-10 students
   - Click download icon
   - Verify immediate download

2. **Large Class Test (Background)**
   - Create a class with 20+ students
   - Click download icon
   - Verify progress modal appears
   - Check browser console for polling requests
   - Verify auto-download when complete

3. **Error Handling Test**
   - Temporarily break database connection
   - Try generating vouchers
   - Verify error message displayed

### API Testing

```bash
# Start a background job
curl -X POST http://localhost:8000/api/fees/vouchers/class/{class_id}/download-all/background \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check job status
curl http://localhost:8000/api/fees/vouchers/jobs/{job_id}/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# Download result
curl http://localhost:8000/api/fees/vouchers/jobs/{job_id}/download \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o result.zip
```

## Monitoring

### Backend Logs

Look for these log messages:

```
[VOUCHER_JOB] Created job abc-123 (zip) for class class_456
[VOUCHER_JOB] Starting job abc-123
[VOUCHER_JOB] Generating ZIP for job abc-123
[VOUCHER_JOB] ✅ Job abc-123 completed successfully (1234567 bytes)
```

### Frontend Debug

```javascript
console.log('[FEE_VOUCHER] Starting background job for class:', classData.id);
console.log('[FEE_VOUCHER] Background job started:', result.job_id);
console.log('[FEE_VOUCHER] Job status:', status);
```

## Known Limitations

1. **In-Memory Storage**: Jobs lost on server restart
2. **Single Server**: Won't work across multiple server instances without Redis
3. **No Cancellation**: Once started, jobs cannot be cancelled
4. **Fixed Polling Interval**: 1 second may be too aggressive for very large classes

## Future Improvements

- [ ] Add job cancellation endpoint
- [ ] Migrate to Redis for persistence
- [ ] Implement WebSocket for real-time updates
- [ ] Add email notification when job completes
- [ ] Add job history page for users
- [ ] Implement progress streaming (more granular updates)
- [ ] Add job priority queue
- [ ] Add batch job support (multiple classes at once)

## Summary

This implementation provides a robust solution for Heroku's 30-second timeout by:
- ✅ Moving long-running operations to background threads
- ✅ Providing user feedback via progress modal
- ✅ Automatic download when ready
- ✅ Graceful error handling
- ✅ Transparent experience for small classes

Users can now generate vouchers for classes of any size without timeout errors!
