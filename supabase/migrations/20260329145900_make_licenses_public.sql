-- Update user-licenses bucket to be public to support public URLs
UPDATE storage.buckets
SET public = true
WHERE id = 'user-licenses';
