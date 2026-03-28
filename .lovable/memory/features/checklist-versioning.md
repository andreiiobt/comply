Checklist template version control: snapshot-on-submit + full changelog

- `checklist_template_versions` table: records each edit with version_number, items snapshot, changed_by, changed_at, change_summary
- `checklist_submissions.template_snapshot` (jsonb): freezes template title+items at submission time
- ChecklistSubmissionDetail uses template_snapshot first, falls back to live template
- Version recorded on every create/update in both admin and manager ChecklistTemplates pages
- VersionHistoryDialog component shows diff (added/removed items) between versions
- History button on admin template cards
