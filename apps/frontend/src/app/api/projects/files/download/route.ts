import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function getApiBaseUrl() {
  const baseUrl = process.env.API_BASE_URL?.trim();

  if (!baseUrl) {
    return null;
  }

  return baseUrl.replace(/\/docs\/?$/, '');
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storageKey = searchParams.get('storageKey')?.trim();
    const preview = searchParams.get('preview') === '1';
    const apiBaseUrl = getApiBaseUrl();
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;

    if (!storageKey) {
      return NextResponse.json(
        { message: 'storageKey is required.' },
        { status: 400 },
      );
    }

    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (!apiBaseUrl) {
      return NextResponse.json(
        { message: 'API_BASE_URL is not configured.' },
        { status: 500 },
      );
    }

    const normalizedStorageKey = storageKey.replace(/^\/+/, '');
    const presignParams = new URLSearchParams({
      key: normalizedStorageKey,
      action: 'download',
    });
    const presignResponse = await fetch(
      `${apiBaseUrl}/utility/presigned-url?${presignParams.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      },
    );
    const presignData = (await presignResponse.json().catch(() => null)) as {
      url?: string;
      message?: string;
    } | null;

    if (!presignResponse.ok || !presignData?.url) {
      return NextResponse.json(
        { message: presignData?.message || 'Failed to prepare file.' },
        { status: presignResponse.status || 500 },
      );
    }

    const range = request.headers.get('range');
    const response = await fetch(presignData.url, {
      headers: range ? { Range: range } : undefined,
      cache: 'no-store',
    });

    if (!response.ok || !response.body) {
      return NextResponse.json(
        { message: 'Failed to download file.' },
        { status: response.status || 500 },
      );
    }

    const requestedFileName = searchParams.get('fileName')?.trim();
    const storageFileName = normalizedStorageKey.split('/').at(-1);
    const fileName = sanitizeFileName(
      requestedFileName || storageFileName || 'download',
    );

    const responseHeaders = new Headers({
      'Content-Type':
        response.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': createContentDisposition(
        fileName,
        preview ? 'inline' : 'attachment',
      ),
      'Cache-Control': 'private, no-store',
    });

    ['accept-ranges', 'content-length', 'content-range'].forEach((header) => {
      const value = response.headers.get(header);
      if (value) responseHeaders.set(header, value);
    });

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { message: 'Something went wrong while downloading the file.' },
      { status: 500 },
    );
  }
}

function sanitizeFileName(fileName: string) {
  return (
    Array.from(fileName.replace(/["\\/]/g, '_'))
      .filter((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint > 31 && codePoint !== 127;
      })
      .join('')
      .trim() || 'download'
  );
}

function createContentDisposition(
  fileName: string,
  disposition: 'inline' | 'attachment',
) {
  const sanitizedFileName = sanitizeFileName(fileName);
  const asciiFallback =
    sanitizedFileName
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '_') || 'download';
  const encodedFileName = encodeURIComponent(sanitizedFileName).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedFileName}`;
}
