import { useState, useMemo } from "react";
import { complianceLibrary, LIBRARY_CATEGORIES, type LibraryTemplate } from "@/lib/compliance-library";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag, Camera, Search, Copy } from "lucide-react";

interface Props {
  onUseTemplate: (template: LibraryTemplate) => void;
}

export default function ComplianceLibraryTab({ onUseTemplate }: Props) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return complianceLibrary.filter((t) => {
      if (selectedCategory && t.category !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [search, selectedCategory]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant={selectedCategory === null ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Button>
          {LIBRARY_CATEGORIES.map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={selectedCategory === cat ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No templates match your search.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const photoCount = t.items.filter((i) => i.requires_photo).length;
            return (
              <Card key={t.id} className="-dashed transition-shadow ">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base leading-snug">{t.title}</CardTitle>
                  <CardDescription className="line-clamp-2 text-xs">{t.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">{t.items.length} items</span>
                    {photoCount > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <Camera className="h-3 w-3" /> {photoCount}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Tag className="h-2.5 w-2.5" /> {t.category}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 gap-1.5 w-full"
                    onClick={() => onUseTemplate(t)}
                  >
                    <Copy className="h-3.5 w-3.5" /> Use Template
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
