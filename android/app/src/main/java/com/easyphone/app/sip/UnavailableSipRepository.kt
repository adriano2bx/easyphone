package com.easyphone.app.sip

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Implementação atual: o mecanismo SIP ainda não existe nesta base Android.
 *
 * Decisão deliberada: não há simulação de registro, áudio ou chamadas. Todas as listas começam vazias,
 * nenhuma conta é registrada e toda ação responde [SipFailure.Unavailable]. Substituir esta classe pela
 * implementação real quando ela existir; nenhuma tela precisa mudar.
 */
class UnavailableSipRepository : SipRepository {

    override val isAvailable: Boolean = false

    override val accounts: StateFlow<List<SipAccountSummary>> =
        MutableStateFlow<List<SipAccountSummary>>(emptyList())

    override val selectedAccountId: StateFlow<String?> = MutableStateFlow<String?>(null)

    override val activeCall: StateFlow<PhoneCall?> = MutableStateFlow<PhoneCall?>(null)

    private val unavailable: SipResult = SipResult.Failed(SipFailure.Unavailable)

    override suspend fun saveAccount(draft: SipAccountDraft): SipResult = unavailable
    override suspend fun removeAccount(accountId: String): SipResult = unavailable
    override suspend fun selectAccount(accountId: String): SipResult = unavailable
    override suspend fun register(accountId: String): SipResult = unavailable
    override suspend fun unregister(accountId: String): SipResult = unavailable
    override suspend fun dial(destination: String): SipResult = unavailable
    override suspend fun answer(callId: String): SipResult = unavailable
    override suspend fun reject(callId: String): SipResult = unavailable
    override suspend fun hangup(callId: String): SipResult = unavailable
    override suspend fun setMuted(callId: String, muted: Boolean): SipResult = unavailable
    override suspend fun setHeld(callId: String, held: Boolean): SipResult = unavailable
    override suspend fun sendDtmf(callId: String, digits: String): SipResult = unavailable
    override suspend fun transfer(callId: String, destination: String): SipResult = unavailable
}
