import { GraduationCap, Heart, MoreHorizontal, Paperclip, Scale, type LucideIcon } from "lucide-react";

const DOMAIN_ICON_BY_ID: Record<string, LucideIcon> = {
  iep: GraduationCap,
  medicaid: Heart,
  bankruptcy: Scale,
};

export function intakeDomainMenuIcon(domainId: string): LucideIcon {
  return DOMAIN_ICON_BY_ID[domainId] ?? MoreHorizontal;
}

export function intakeAddFilesMenuIcon(): LucideIcon {
  return Paperclip;
}
