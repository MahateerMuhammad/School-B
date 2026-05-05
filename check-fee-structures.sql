-- Check classes and their fee structures
SELECT 
  c.id,
  c.name,
  cfs.admission_fee,
  cfs.monthly_fee,
  cfs.paper_fund,
  cfs.effective_from
FROM classes c
LEFT JOIN class_fee_structure cfs ON c.id = cfs.class_id
WHERE cfs.effective_from = (
  SELECT MAX(effective_from) 
  FROM class_fee_structure 
  WHERE class_id = c.id
)
ORDER BY c.id;
