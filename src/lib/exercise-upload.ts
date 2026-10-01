// Extra upload support used by the new exercise without disturbing the battle-tested
// photo/video/audio handling in upload.ts.
import type { Upload } from '../../server/lib/types.ts';
import { fileToUpload as baseFileToUpload, UploadError } from './upload';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new UploadError('Couldn’t read that PowerPoint. Try again.'));
    reader.readAsDataURL(file);
  });
}

export async function exerciseFileToUpload(file: File): Promise<Upload> {
  const isPptx = file.type === PPTX_MIME || /\.pptx$/i.test(file.name);
  if (!isPptx) return baseFileToUpload(file);
  if (file.size > MAX_DOCUMENT_BYTES) throw new UploadError('That PowerPoint is too big. Keep it under 10 MB.');
  return { kind: 'document', dataUrl: await readAsDataURL(file), filename: file.name };
}
