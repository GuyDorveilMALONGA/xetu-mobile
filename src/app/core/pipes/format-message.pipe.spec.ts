import { FormatMessagePipe } from './format-message.pipe';

describe('FormatMessagePipe', () => {
  let pipe: FormatMessagePipe;

  beforeEach(() => {
    pipe = new FormatMessagePipe();
  });

  it('create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should escape HTML tags to prevent XSS', () => {
    const raw = '<script>alert("xss")</script> & hello';
    const result = pipe.transform(raw);
    expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; hello');
  });

  it('should format *bold* text to <strong>', () => {
    const raw = 'This is *bold* text.';
    const result = pipe.transform(raw);
    expect(result).toBe('This is <strong>bold</strong> text.');
  });

  it('should format _italic_ text to <em>', () => {
    const raw = 'This is _italic_ text.';
    const result = pipe.transform(raw);
    expect(result).toBe('This is <em>italic</em> text.');
  });

  it('should convert newlines to <br>', () => {
    const raw = 'Line 1\nLine 2';
    const result = pipe.transform(raw);
    expect(result).toBe('Line 1<br>Line 2');
  });

  it('should handle nested/combined formatting safely', () => {
    const raw = 'Hello *world*!\nCheck this <tag> out with _italics_.';
    const result = pipe.transform(raw);
    expect(result).toBe('Hello <strong>world</strong>!<br>Check this &lt;tag&gt; out with <em>italics</em>.');
  });

  it('should handle empty or null values', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });
});
