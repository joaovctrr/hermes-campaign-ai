import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/analysis")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
