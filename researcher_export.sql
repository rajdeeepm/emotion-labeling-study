-- This will be run in the Supabase SQL Editor as the researcher.
-- This export shows exactly who labeled which tweet with which label,
-- alongside hidden ground truth for later agreement/accuracy analysis.

select
  a.study_version,
  a.participant_id,
  a.position,
  a.tweet_id,
  i.tweet_text,
  n.chosen_label,
  i.ground_truth,
  (n.chosen_label = i.ground_truth) as matches_ground_truth,
  a.assigned_at,
  n.submitted_at,
  p.started_at,
  p.completed_at
from public.assignments a
join public.study_items i
  on i.study_version = a.study_version
 and i.tweet_id = a.tweet_id
join public.participants p
  on p.study_version = a.study_version
 and p.participant_id = a.participant_id
left join public.annotations n
  on n.study_version = a.study_version
 and n.participant_id = a.participant_id
 and n.tweet_id = a.tweet_id
where a.study_version = 'emotion-v1'
order by a.participant_id, a.position;
