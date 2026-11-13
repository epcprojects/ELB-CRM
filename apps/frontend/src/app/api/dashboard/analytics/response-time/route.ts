import { NextRequest } from 'next/server';
import { proxyAnalyticsRequest } from '../../../../../lib/analytics-proxy';

export async function GET(request: NextRequest) {
  return proxyAnalyticsRequest(request, '/dashboard/analytics/response-time');
}
