import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/territory")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
