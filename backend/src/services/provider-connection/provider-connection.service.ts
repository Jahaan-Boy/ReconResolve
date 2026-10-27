import {
    createProviderConnectionRepository,
    type ListConnectionsFilter,
    type ListConnectionsResult,
    type ProviderConnectionDetail,
    type ProviderConnectionRepository,
} from '../../repositories/provider-connection.repository';
import { ProviderConnectionError } from './errors';

export interface ProviderConnectionService {
    listConnections(merchantId: string, filter: ListConnectionsFilter): Promise<ListConnectionsResult>;
    getConnection(merchantId: string, connectionId: string): Promise<ProviderConnectionDetail>;
}

export function createProviderConnectionService(
    repository: ProviderConnectionRepository = createProviderConnectionRepository(),
): ProviderConnectionService {
    return {
        async listConnections(merchantId: string, filter: ListConnectionsFilter): Promise<ListConnectionsResult> {
            return repository.list(merchantId, filter);
        },

        async getConnection(merchantId: string, connectionId: string): Promise<ProviderConnectionDetail> {
            const connection = await repository.findById(merchantId, connectionId);
            if (!connection) {
                // Conceal cross-tenant or missing connection with 404
                throw ProviderConnectionError.notFound('Provider connection not found or access denied');
            }
            return connection;
        },
    };
}
