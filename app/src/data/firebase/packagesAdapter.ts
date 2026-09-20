import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { PackageDefinition, PackageId, PackagesAdapter } from "@/data/types";

interface GetPackagesResponse {
  readonly packages: readonly PackageDefinition[];
}

const getPackagesCallable = httpsCallable<Record<string, never>, GetPackagesResponse>(functions, "getPackages");

/** Real adapter: calls the `getPackages` Cloud Function against the local emulator — see docs/PROGRESS.md. */
export function createFirebasePackagesAdapter(): PackagesAdapter {
  const listPackages = async (): Promise<readonly PackageDefinition[]> => {
    const result = await getPackagesCallable({});
    return result.data.packages;
  };

  return {
    listPackages,
    getPackage: async (id: PackageId) => (await listPackages()).find((pkg) => pkg.id === id),
  };
}
