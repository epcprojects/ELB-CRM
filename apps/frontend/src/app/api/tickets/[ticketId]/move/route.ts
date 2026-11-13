import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

type MoveTicketPayload = { targetProjectId?: string };

function getApiBaseUrl() {
  const baseUrl = process.env.API_BASE_URL?.trim();
  return baseUrl ? baseUrl.replace(/\/docs\/?$/, '') : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const token = (await cookies()).get('access_token')?.value;
    if (!token)
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl)
      return NextResponse.json(
        { message: 'API_BASE_URL is not configured.' },
        { status: 500 },
      );

    const { ticketId } = await context.params;
    const body = (await request
      .json()
      .catch(() => null)) as MoveTicketPayload | null;
    const targetProjectId = body?.targetProjectId?.trim();
    if (!targetProjectId)
      return NextResponse.json(
        { message: 'Target project is required.' },
        { status: 400 },
      );

    const response = await fetch(`${apiBaseUrl}/tickets/${ticketId}/move`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ targetProjectId }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      return NextResponse.json(
        { message: data?.message || 'Failed to move ticket.' },
        { status: response.status },
      );
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: 'Something went wrong while moving the ticket.' },
      { status: 500 },
    );
  }
}
