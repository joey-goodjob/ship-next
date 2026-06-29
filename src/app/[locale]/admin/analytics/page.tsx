import { Suspense } from "react";

import { AdminAnalyticsClient } from "./analytics-client";

export default function AdminAnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AdminAnalyticsClient />
    </Suspense>
  );
}
