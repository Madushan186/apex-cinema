import type { PackageDefinition, PackageId, PackagesAdapter } from "@/data/types";
import { PACKAGE_FIXTURES } from "./packages";

const FIXTURE_LATENCY_MS = 200;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), FIXTURE_LATENCY_MS));
}

export function createFixturePackagesAdapter(): PackagesAdapter {
  return {
    listPackages(): Promise<readonly PackageDefinition[]> {
      return delay(PACKAGE_FIXTURES);
    },
    getPackage(id: PackageId): Promise<PackageDefinition | undefined> {
      return delay(PACKAGE_FIXTURES.find((pkg) => pkg.id === id));
    },
  };
}
