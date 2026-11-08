export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
};

/** Type MIME à envoyer : celui du navigateur s'il est connu, sinon déduit de l'extension. */
export function mimeTypeForFile(file: { name: string; type: string }): string | null {
  const declared = file.type.split(';')[0]?.trim().toLowerCase();
  if (declared && Object.values(MIME_BY_EXTENSION).includes(declared)) {
    return declared;
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? null;
}

/** Message d'erreur si le fichier ne peut pas être envoyé, sinon null. */
export function uploadProblem(file: { name: string; type: string; size: number }): string | null {
  if (mimeTypeForFile(file) === null) {
    return 'Format non pris en charge : choisissez un PDF, un fichier .txt ou .md.';
  }
  if (file.size === 0) {
    return 'Le fichier est vide.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'Le fichier dépasse 8 Mo.';
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
