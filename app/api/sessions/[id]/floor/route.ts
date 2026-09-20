import { releaseFloor, takeFloor } from "@/lib/session/store";
import { checkOrigin, failure, json } from "@/lib/server/http";

export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/floor">) {
  try {
    checkOrigin(request);
    const { id } = await context.params;
    return json({ floor: await takeFloor(id) });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: RouteContext<"/api/sessions/[id]/floor">) {
  try {
    checkOrigin(request);
    const { id } = await context.params;
    return json({ floor: await releaseFloor(id) });
  } catch (error) { return failure(error); }
}
