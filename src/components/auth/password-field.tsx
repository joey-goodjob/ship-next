"use client";

import type { ComponentProps } from "react";
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordFieldProps = Omit<ComponentProps<typeof Input>, "type"> & {
  revealLabel: string;
  hideLabel: string;
};

export function PasswordField({
  className,
  id,
  revealLabel,
  hideLabel,
  ...props
}: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        id={inputId}
        type={visible ? "text" : "password"}
        className={cn("h-11 pr-11", className)}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={visible ? hideLabel : revealLabel}
        className="absolute right-1.5 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
}
