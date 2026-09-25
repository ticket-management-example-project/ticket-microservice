import { DomainException } from 'src/shared/exceptions/base.exception';

/**
 * I/O Matrix: "Crear ticket en tenant inexistente" -> 404
 * `TENANT_NOT_FOUND`, nothing persisted. `find_tenant_by_slug` (NATS,
 * `tenant-microservice`) returns `null` for "no such slug"; this is the
 * typed translation of that `null`, same pattern as
 * `OrganizationNotFoundException` in `tenant-microservice`.
 */
export class TenantNotFoundException extends DomainException {
  constructor(tenantSlug: string) {
    super('TENANT_NOT_FOUND', `Tenant "${tenantSlug}" does not exist`, {
      tenantSlug,
    });
  }
}
