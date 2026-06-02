"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

// Unified back button used across the app. Pass `href` for a known destination
// (renders a link); omit it to step back in history.
export function BackButton({
  href, label = "Back", className,
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  if (href) {
    return (
      <Button asChild variant="ghost" size="sm" className={className}>
        <Link href={href}>
          <ArrowLeft className="h-4 w-4" />
          {label}
        </Link>
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="sm" className={className} onClick={() => router.back()}>
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
