import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Users, CheckSquare, BarChart3, ArrowRight, ArrowLeft } from "lucide-react";

const steps = [
  {
    icon: CheckSquare,
    title: "Welcome to Comply!",
    description: "Your compliance platform is ready. Let's walk you through the key features so you can hit the ground running.",
  },
  {
    icon: MapPin,
    title: "Locations & Users",
    description: "Start by adding your company locations, then invite managers and staff. Each user gets role-based access to the tools they need.",
  },
  {
    icon: CheckSquare,
    title: "Checklists",
    description: "Create compliance checklist templates, assign them to teams or locations, and review submissions as they come in.",
  },
  {
    icon: BarChart3,
    title: "Reports & Incidents",
    description: "Track compliance metrics with daily overviews and reports. Staff can submit incident reports that managers review and resolve.",
  },
];

interface Props {
  userId: string;
}

export default function WelcomeOnboardingModal({ userId }: Props) {
  const storageKey = `onboarding_seen_${userId}`;
  const [open, setOpen] = useState(!localStorage.getItem(storageKey));
  const [step, setStep] = useState(0);

  const close = () => {
    localStorage.setItem(storageKey, "true");
    setOpen(false);
  };

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="flex flex-col items-center text-center px-8 pt-10 pb-6 gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground">{current.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{current.description}</p>
        </div>

        {/* dots */}
        <div className="flex justify-center gap-1.5 pb-4">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between px-6 pb-6">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={close}>Skip</Button>
          )}

          {isLast ? (
            <Button size="sm" onClick={close}>
              Get Started <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep(step + 1)}>
              Next <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
