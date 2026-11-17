-- Ensure every department has an 'Others' category in both departments.category_tags and public.categories
UPDATE public.departments
SET category_tags = array_append(category_tags, 'Others')
WHERE NOT ('Others' = ANY(category_tags));

INSERT INTO public.categories (department_id, name)
SELECT d.id, 'Others'
FROM public.departments d
ON CONFLICT (department_id, name) DO NOTHING;
