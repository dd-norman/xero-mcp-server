// Shared by invoice line items (LineItemTracking) and manual journal lines (TrackingCategory)
type Tracking = {
  name?: string;
  option?: string;
  trackingCategoryID?: string;
};

export const formatTracking = (tracking?: Tracking[]): string => {
  return tracking?.length
    ? tracking
      .map((t) => `${t.name}: ${t.option} (trackingCategoryID: ${t.trackingCategoryID})`)
      .join("; ")
    : "None";
};
