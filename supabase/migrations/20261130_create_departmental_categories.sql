-- ============================================================================
-- MIGRATION: Create Dynamic Departmental Categories Table & RLS Policies
-- Target Fix: Could not find the table 'public.categories' in the schema cache
-- ============================================================================

-- 1. Create public.categories table
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT categories_department_name_unique UNIQUE (department_id, name)
);

-- 2. Index for high-performance department category filtering
CREATE INDEX IF NOT EXISTS idx_categories_department_id ON public.categories(department_id);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON public.categories(is_active);

-- 3. Seed initial categories from departments.category_tags array
INSERT INTO public.categories (department_id, name, is_active)
SELECT d.id, unnest(d.category_tags), true
FROM public.departments d
WHERE d.category_tags IS NOT NULL AND array_length(d.category_tags, 1) > 0
ON CONFLICT (department_id, name) DO NOTHING;

-- Ensure every department has an 'Others' category
INSERT INTO public.categories (department_id, name, is_active)
SELECT d.id, 'Others', true
FROM public.departments d
ON CONFLICT (department_id, name) DO NOTHING;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- 5. Grant permissions to standard roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT ON public.categories TO anon, public;

-- 6. Clean up existing conflicting policies if any
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.categories;
DROP POLICY IF EXISTS "Categories are viewable by authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Office heads can add categories to their department" ON public.categories;
DROP POLICY IF EXISTS "Office heads can delete categories from their department" ON public.categories;
DROP POLICY IF EXISTS "Department staff and super admin can insert categories" ON public.categories;
DROP POLICY IF EXISTS "Department staff and super admin can update categories" ON public.categories;
DROP POLICY IF EXISTS "Department staff and super admin can delete categories" ON public.categories;

-- 7. RLS Policies:

-- A) SELECT Policy: Anyone (students, guests, staff) can view active categories
CREATE POLICY "Categories are viewable by everyone"
ON public.categories FOR SELECT
TO public
USING (true);

-- B) INSERT Policy: Department staff / office heads / dept admins can add categories ONLY for their department (Super Admin for all)
CREATE POLICY "Department staff and super admin can insert categories"
ON public.categories FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
              p.role = 'super_admin'
              OR (
                  p.role IN ('office_head', 'dept_admin', 'staff', 'officer')
                  AND p.department_id = categories.department_id
              )
          )
    )
);

-- C) UPDATE Policy: Department staff / office heads / dept admins can update their department's categories (Super Admin for all)
CREATE POLICY "Department staff and super admin can update categories"
ON public.categories FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
              p.role = 'super_admin'
              OR (
                  p.role IN ('office_head', 'dept_admin', 'staff', 'officer')
                  AND p.department_id = categories.department_id
              )
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
              p.role = 'super_admin'
              OR (
                  p.role IN ('office_head', 'dept_admin', 'staff', 'officer')
                  AND p.department_id = categories.department_id
              )
          )
    )
);

-- D) DELETE Policy: Department staff / office heads / dept admins can delete categories from their department (Super Admin for all)
CREATE POLICY "Department staff and super admin can delete categories"
ON public.categories FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
              p.role = 'super_admin'
              OR (
                  p.role IN ('office_head', 'dept_admin', 'staff', 'officer')
                  AND p.department_id = categories.department_id
              )
          )
    )
);

-- 8. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
