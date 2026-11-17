-- Allow authenticated users (students & teachers/admins) to update their own department_id
-- in My Profile & Identity Settings while keeping role and is_blocked strictly immutable.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id
    AND EXISTS (
        SELECT 1 FROM public.get_profile_immutable_fields(auth.uid()) g
        WHERE g.role = profiles.role
          AND g.is_blocked = profiles.is_blocked
    )
);

NOTIFY pgrst, 'reload schema';
