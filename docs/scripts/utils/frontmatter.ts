import { ReflectionKind } from 'typedoc';
import type { MarkdownPageEvent } from 'typedoc-plugin-markdown';
import { titleFromFilename, titleFromIdCapitalized } from './string.ts';

const API_HOMEPAGE_TITLE = 'Overview';

export function addPageFrontmatter(page: MarkdownPageEvent) {
  if (page.model && 'kind' in page.model) {
    let title = '';

    switch (page.model.kind) {
      case ReflectionKind.Module:
        if (page.model.name.startsWith('@')) {
          const packageName = page.model.name.split('/')[1]!;
          title = titleFromIdCapitalized(packageName);
        } else if (page.model.name === 'api' && page.model.parent?.name.startsWith('@')) {
          title = API_HOMEPAGE_TITLE;
        } else {
          // should never happen
          title = titleFromIdCapitalized(page.model.name);
        }
        break;
      default:
        title = titleFromFilename(page.model.name);
    }

    page.frontmatter = {
      title,
      ...page.frontmatter,
    };
  }
}
