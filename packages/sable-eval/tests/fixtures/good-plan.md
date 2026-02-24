# Plan: Add File Upload Feature

**Task:** 2.3 - File Upload with S3 Storage
**Complexity:** Moderate

---

## Grouping Decision: GROUP (2 items)

**Rationale**: User cares about "can upload files" -- neither the upload endpoint alone nor the storage layer alone is useful. Together they produce a working feature.

**Items**:
1. Storage service with S3 integration
   - Would user care alone? NO -- nowhere to call it from
2. Upload API endpoint
   - Would user care alone? NO -- nothing to store to

**Combined outcome**: User can upload a file and see it stored and retrievable.

---

## Risk Assessment

**Complexity**: Moderate
- New service, but follows existing pattern in `src/lib/email-service.ts`
- S3 SDK is well-documented, no unknowns
- Multipart parsing adds some complexity but `busboy` handles it

**Flags**:
- needs_arch: false -- pattern exists in email-service, no design decisions needed
- needs_impl: true -- reviewer should verify S3 error handling and multipart edge cases

**Risks**:
| Risk | Severity | Mitigation |
|------|----------|------------|
| S3 credentials missing in dev environment | Medium | Fallback to local filesystem storage with clear log warning |
| Large file timeout on upload | Low | Use multipart upload for files >5MB, set 30s timeout |
| File type validation bypass | Medium | Validate MIME type server-side, don't trust Content-Type header |

---

## Implementation Path

**Files**:
| File | Action | Changes |
|------|--------|---------|
| src/lib/storage-service.ts | Create | S3 client wrapper with upload/download/delete methods |
| src/api/routes/upload.ts | Create | POST /api/upload multipart handler with validation |
| src/lib/config.ts | Modify | Add S3_BUCKET, S3_REGION, S3_ACCESS_KEY env vars |
| src/api/middleware/file-validation.ts | Create | MIME type + size validation middleware |

**Pattern**: Follow `src/lib/email-service.ts` structure:
- Constructor takes config object
- Methods return `Result<T, Error>` union type
- Errors are typed enums, not thrown
- All external calls wrapped in try/catch with typed error returns

**Demo**:
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@test.txt"
# Returns: {"url": "https://bucket.s3.amazonaws.com/uploads/test.txt", "size": 1234}

curl http://localhost:3000/api/upload/test.txt
# Returns: file content with correct Content-Type header
```

---

## Test Considerations

**Invariants** (from iteration):
- File uploads MUST NOT corrupt data (checksum verification)
- Failed uploads MUST NOT leave partial files in S3
- MIME type validation MUST happen server-side

**Risk Areas** (for test-runner):
- S3 error handling -- what happens when S3 returns 503?
- Large file handling -- does multipart chunking work correctly?
- Concurrent uploads -- race conditions on filename collisions

**Scenarios**:
- Happy: Upload 1KB text file, verify retrievable with correct content
- Happy: Upload 5MB image, verify multipart upload completes
- Error: Upload with invalid credentials, expect 401 with clear message
- Error: Upload to full bucket, expect 507 with retry-after header
- Error: Upload file exceeding size limit, expect 413
- Edge: Upload file with unicode filename, verify URL encoding
- Edge: Upload empty file, verify 400 validation error
