
CREATE POLICY "Users can upload own assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ugc-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own assets"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ugc-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ugc-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
