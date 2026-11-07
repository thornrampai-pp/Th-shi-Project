-- Theses backfilled by 20261026164441_thesis_sections got Thai default section titles,
-- while the app now creates English ones (thesis.service.ts DEFAULT_SECTION_TITLES).
-- Rename only titles still exactly equal to a Thai default; anything the user wrote or
-- renamed is left alone.
UPDATE "ThesisSection" AS s
SET "title" = m.english, "updatedAt" = s."updatedAt"
FROM (VALUES
    ('ธุรกิจและรายได้', 'Business & Revenue'),
    ('ปัจจัยการเติบโต', 'Growth Drivers'),
    ('ความเสี่ยง', 'Risks'),
    ('คู่แข่ง', 'Competitors'),
    ('จุดซื้อ/จุดขาย', 'Entry & Exit Points'),
    ('ปันผล', 'Dividends'),
    ('โน้ตเพิ่มเติม', 'Additional Notes')
) AS m(thai, english)
WHERE s."title" = m.thai;
