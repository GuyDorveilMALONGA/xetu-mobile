import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatMessage',
  standalone: true
})
export class FormatMessagePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';

    // 1. Escape HTML to prevent XSS
    let escaped = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // 2. Apply Markdown-like formatting
    // Bold: *text* -> <strong>text</strong>
    escaped = escaped.replace(/\*(.*?)\*/g, '<strong>$1</strong>');

    // Italic: _text_ -> <em>text</em>
    escaped = escaped.replace(/_(.*?)_/g, '<em>$1</em>');

    // Newlines: \n -> <br>
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
  }
}
