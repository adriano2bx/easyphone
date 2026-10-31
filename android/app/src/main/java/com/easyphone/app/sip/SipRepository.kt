package com.easyphone.app.sip

import kotlinx.coroutines.flow.StateFlow

/**
 * Contrato do repositório SIP usado pela UI.
 *
 * Decisões:
 * - A UI só depende desta interface. A implementação real (biblioteca SIP nativa, serviço em primeiro
 *   plano para manter a chamada viva em segundo plano, áudio) entrará em outra classe sem alterar telas.
 * - Todas as ações são `suspend` e retornam [SipResult]: falhas são valores, não exceções, para que a UI
 *   informe o motivo real em vez de fingir sucesso.
 * - Estados são [StateFlow]: a UI reage a eventos reais do mecanismo, nunca a valores de exemplo.
 * - Áudio (dispositivos de entrada/saída) fica fora deste contrato nesta versão; será adicionado junto
 *   com a implementação de áudio, espelhando AudioDevice do contrato desktop.
 */
interface SipRepository {
    /** true somente quando há um mecanismo SIP real. Com false, a UI deve exibir estado indisponível. */
    val isAvailable: Boolean

    val accounts: StateFlow<List<SipAccountSummary>>
    val selectedAccountId: StateFlow<String?>

    /** Chamada atual, ou null quando não há chamada. */
    val activeCall: StateFlow<PhoneCall?>

    suspend fun saveAccount(draft: SipAccountDraft): SipResult
    suspend fun removeAccount(accountId: String): SipResult
    suspend fun selectAccount(accountId: String): SipResult
    suspend fun register(accountId: String): SipResult
    suspend fun unregister(accountId: String): SipResult

    suspend fun dial(destination: String): SipResult
    suspend fun answer(callId: String): SipResult
    suspend fun reject(callId: String): SipResult
    suspend fun hangup(callId: String): SipResult
    suspend fun setMuted(callId: String, muted: Boolean): SipResult
    suspend fun setHeld(callId: String, held: Boolean): SipResult
    suspend fun sendDtmf(callId: String, digits: String): SipResult
    suspend fun transfer(callId: String, destination: String): SipResult
}
