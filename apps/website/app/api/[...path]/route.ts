const unavailable = () =>
  Response.json(
    {
      status: "unavailable",
      message:
        "Authentication and business API are not connected to this preview.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );

export const GET = unavailable;
export const POST = unavailable;
export const PUT = unavailable;
export const PATCH = unavailable;
export const DELETE = unavailable;
