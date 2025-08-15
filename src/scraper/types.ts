// src/scraper/types.ts
export interface HelpLocation {
  // existing
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  website?: string;

  // new
  yearsOfService?: number;
  roles?: string[];
  email?: string;
  languages?: string[];
  licensedIn?: string[];
  hours?: {
    Mon?: string;
    Tue?: string;
    Wed?: string;
    Thu?: string;
    Fri?: string;
    Sat?: string;
    Sun?: string;
  };
}
