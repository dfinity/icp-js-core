export function idFromFilename(fileName: string): string {
  return fileName.replace(/\.mdx?$/, '');
}

export function titleFromFilename(fileName: string): string {
  return titleFromId(idFromFilename(fileName));
}

export function titleFromId(id: string): string {
  return id.replace(/-/g, ' ');
}

export function titleFromIdCapitalized(id: string): string {
  return titleFromId(id).replace(/\b\w/g, char => char.toUpperCase());
}
