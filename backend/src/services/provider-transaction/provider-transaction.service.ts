import {
    createProviderTransactionQueryRepository,
    type ListTransactionsFilter,
    type ListTransactionsResult,
    type ProviderTransactionDetail,
    type ProviderTransactionQueryRepository,
} from '../../repositories/provider-transaction-query.repository';
import { ProviderTransactionError } from './errors';

export interface ProviderTransactionService {
    listTransactions(merchantId: string, filter: ListTransactionsFilter): Promise<ListTransactionsResult>;
    getTransaction(merchantId: string, transactionId: string): Promise<ProviderTransactionDetail>;
}

export function createProviderTransactionService(
    repository: ProviderTransactionQueryRepository = createProviderTransactionQueryRepository(),
): ProviderTransactionService {
    return {
        async listTransactions(merchantId: string, filter: ListTransactionsFilter): Promise<ListTransactionsResult> {
            // Validate date range semantics if both provided
            if (filter.from && filter.to && filter.from > filter.to) {
                throw ProviderTransactionError.validationFailed('Invalid date range: "from" timestamp must be earlier than or equal to "to" timestamp');
            }

            // Cross-tenant constraint: if connectionId is supplied, verify it belongs to this merchant
            if (filter.connectionId) {
                const belongsToMerchant = await repository.verifyConnectionOwnership(merchantId, filter.connectionId);
                if (!belongsToMerchant) {
                    throw ProviderTransactionError.connectionNotFound('Specified provider connection not found or access denied');
                }
            }

            return repository.list(merchantId, filter);
        },

        async getTransaction(merchantId: string, transactionId: string): Promise<ProviderTransactionDetail> {
            const transaction = await repository.findById(merchantId, transactionId);
            if (!transaction) {
                // Conceal cross-tenant or missing transaction with 404
                throw ProviderTransactionError.notFound('Provider transaction not found or access denied');
            }
            return transaction;
        },
    };
}
