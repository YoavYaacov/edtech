// R1B-1 — data access for the import screens. Only R1A's contract is used: RLS-protected reads, the teacher RPCs,
// and the private `import-sources` bucket (path {uid}/{importId}/source.pdf, no update/delete policy).
import { supabase } from '../../lib/supabaseClient';

export const BUCKET = 'import-sources';
export const sourcePath = (uid, importId) => `${uid}/${importId}/source.pdf`;

export function fetchImports() {
  // import_candidates(review_status) is a tiny plain embed (<= 60 rows per import): the counts are done in the client.
  return supabase
    .from('question_imports')
    .select('id, course_id, source_name, source_type, source_year, status, failure_code, created_at, updated_at, '
      + 'courses(title), import_files(original_name, page_count), import_candidates(review_status)')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
}

export function countCandidates(rows) {
  const out = { total: 0, pending: 0, approved: 0, rejected: 0 };
  for (const r of rows ?? []) { out.total += 1; if (r.review_status in out) out[r.review_status] += 1; }
  return out;
}

export function fetchImport(importId) {
  return supabase
    .from('question_imports')
    .select('id, course_id, source_name, source_type, source_year, status, failure_code, archived_at, created_at, courses(title), '
      + 'import_files(id, original_name, page_count, size_bytes, sha256, storage_path)')
    .eq('id', importId)
    .maybeSingle();
}

export function fetchChunks(importId) {
  return supabase
    .from('import_chunks')
    .select('id, seq, page_from, page_to, kind, status, attempts, next_attempt_at, error_code, warnings, candidates_count, parent_chunk_id')
    .eq('import_id', importId)
    .order('page_from', { ascending: true })
    .order('seq', { ascending: true });
}

// Read-only list for R1B-1 (the Review screen arrives in R1B-2). The hard cap per import is 60 candidates.
export function fetchCandidatesSummary(importId) {
  return supabase
    .from('import_candidates')
    .select('id, ordinal, chunk_id, source_pages, source_label, review_status, flags, draft, duplicate_of_question_id, created_at')
    .eq('import_id', importId)
    .order('created_at', { ascending: true })
    .order('ordinal', { ascending: true })
    .limit(200);
}

// Other, non-archived imports of the same file (same sha256, same owner by RLS).
export async function fetchSameFileImports(sha256, importId) {
  const { data, error } = await supabase
    .from('import_files')
    .select('import_id, original_name, question_imports!inner(id, status, archived_at, source_name, created_at)')
    .eq('sha256', sha256)
    .neq('import_id', importId)
    .is('question_imports.archived_at', null);
  return { data: (data ?? []).map((r) => ({ importId: r.import_id, name: r.question_imports?.source_name || r.original_name })), error };
}

export async function createImport({ clientRequestId, courseId, sourceName, sourceType, sourceYear }) {
  const { data, error } = await supabase.rpc('create_question_import', {
    p_client_request_id: clientRequestId, p_course_id: courseId, p_source_name: sourceName ?? '',
    p_source_type: sourceType || 'original', p_source_year: sourceYear || null,
  });
  return { data, error };
}

// An existing object at the path means a previous attempt of THIS import already uploaded (same idempotent request id).
export async function uploadSource(path, file) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (!error) return { ok: true, existed: false };
  const msg = String(error.message ?? '').toLowerCase();
  if (error.statusCode === '409' || error.status === 409 || msg.includes('already exists') || msg.includes('duplicate')) return { ok: true, existed: true };
  return { ok: false, error };
}

export async function finalizeUpload({ importId, storagePath, originalName, size, sha256, pageCount, pageStats, consent }) {
  const { data, error } = await supabase.rpc('finalize_import_upload', {
    p_import_id: importId, p_storage_path: storagePath, p_original_name: originalName, p_size_bytes: size,
    p_sha256: sha256, p_page_count: pageCount, p_page_stats: pageStats, p_consent: consent,
  });
  return { data, error };
}

export const archiveImport = (importId) => supabase.rpc('archive_import', { p_import_id: importId });
export const retryFailedChunks = (importId) => supabase.rpc('retry_import_chunks', { p_import_id: importId });

// ---- R1B-2: review ----
// Full candidates of one import (the hard cap per import is 60, so this is a small result).
export function fetchCandidates(importId) {
  return supabase
    .from('import_candidates')
    .select('id, ordinal, chunk_id, source_pages, source_label, source_text, proposal, draft, field_origins, flags, '
      + 'duplicate_of_question_id, duplicate_score, review_status, approved_question_id, created_at')
    .eq('import_id', importId)
    .order('created_at', { ascending: true })
    .limit(200);
}

export const saveCandidateDraft = (candidateId, draft) => supabase.rpc('save_candidate_draft', { p_candidate_id: candidateId, p_draft: draft });
export const rejectCandidate = (candidateId) => supabase.rpc('reject_import_candidate', { p_candidate_id: candidateId });
export const approveCandidate = (candidateId, acknowledge) => supabase.rpc('approve_import_candidate', { p_candidate_id: candidateId, p_acknowledge: Boolean(acknowledge) });

// The owner's private bucket: the PDF is read through the teacher's own session (select policy on the own folder).
export async function downloadSource(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return { buffer: null, error: error ?? new Error('empty') };
  return { buffer: await data.arrayBuffer(), error: null };
}

// Read-only provenance card of a question that came from an import (null when it did not).
export function fetchProvenance(questionId) {
  return supabase
    .from('question_provenance')
    .select('question_id, import_id, file_name, source_pages, source_label, source_text, extraction_kind, flags, model, prompt_version, teacher_edited, approved_at')
    .eq('question_id', questionId)
    .maybeSingle();
}
