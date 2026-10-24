import { shouldStopLiveCapture } from "./offline";

export function offlineCaptureGone(): Response | null {
  if (!shouldStopLiveCapture()) return null;
  return Response.json(
    {
      error: "Captura em tempo real encerrada",
      archive: true,
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
