// TanStack Query hooks for the Course / Scorecard reference page. All server
// reads go through the shared api client; query keys mirror the resource. This
// is read-only reference data (no mutations).

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { CourseWithTees, Hole } from '../../types/api';

// GET /api/courses-with-tees — every course with its tee sets nested.
export function useCoursesWithTees(): UseQueryResult<CourseWithTees[]> {
  return useQuery({
    queryKey: ['courses', 'with-tees'],
    queryFn: () => api.get<CourseWithTees[]>('/api/courses-with-tees'),
  });
}

// GET /api/holes?course_id= — per-hole scorecard reference for one course.
// Only runs once a courseId is known (after the course list resolves).
export function useHoles(courseId: number | undefined): UseQueryResult<Hole[]> {
  return useQuery({
    queryKey: ['holes', courseId],
    queryFn: () => api.get<Hole[]>('/api/holes', { course_id: courseId }),
    enabled: courseId !== undefined,
  });
}
