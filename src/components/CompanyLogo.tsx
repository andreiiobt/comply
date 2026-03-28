interface CompanyLogoProps {
  logoUrl?: string | null;
  companyName?: string | null;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
}

const sizeMap = {
  sm: "h-8 w-8 rounded-xl text-sm",
  md: "h-12 w-12 rounded-2xl text-lg",
  lg: "h-20 w-20 rounded-3xl text-2xl",
};

const imgSizeMap = {
  sm: "h-8 w-8 rounded-xl",
  md: "h-12 w-12 rounded-2xl",
  lg: "h-20 w-20 rounded-3xl",
};

const nameSizeMap = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};

export function CompanyLogo({ logoUrl, companyName, size = "sm", showName = true }: CompanyLogoProps) {
  const name = companyName || "Comply";

  return (
    <div className="flex items-center gap-2">
      {logoUrl ? (
        <img src={logoUrl} alt={name} className={`${imgSizeMap[size]} object-contain flex-shrink-0`} />
      ) : (
        <div className={`${sizeMap[size]} bg-primary flex items-center justify-center flex-shrink-0`}>
          <span className="font-display font-bold text-primary-foreground">{name.charAt(0)}</span>
        </div>
      )}
      {showName && (
        <span className={`font-display font-bold text-foreground ${nameSizeMap[size]}`}>{name}</span>
      )}
    </div>
  );
}
