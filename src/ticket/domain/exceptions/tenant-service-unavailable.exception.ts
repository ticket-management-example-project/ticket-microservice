import { InfrastructureException } from 'src/shared/exceptions/base.exception';

/**
 * `find_tenant_by_slug` (NATS, `tenant-microservice`) timed out or the
 * transport failed. Distinct from `TenantNotFoundException` (a domain
 * outcome): this is the dependency itself being unreachable, so it must
 * never surface as a raw `TimeoutError` -- same pattern as
 * `OrganizationServiceUnavailableException` in `tenant-microservice`.
 */
export class TenantServiceUnavailableException extends InfrastructureException {
  constructor(tenantSlug: string, cause: unknown) {
    super(
      'TENANT_SERVICE_UNAVAILABLE',
      `Could not reach tenant-microservice to resolve Tenant slug "${tenantSlug}"`,
      { tenantSlug, cause: cause instanceof Error ? cause.message : cause },
    );
  }
}
