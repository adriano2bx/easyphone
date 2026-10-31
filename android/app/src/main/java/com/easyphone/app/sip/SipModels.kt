package com.easyphone.app.sip

/*
 * Tipos do contrato SIP do easyphone Android.
 *
 * Os nomes e valores espelham phone-desktop/contracts/phone-bridge.d.ts para que a futura
 * implementação nativa e o desktop compartilhem o mesmo vocabulário de estados.
 * Existir um tipo aqui NÃO significa que a telefonia exista nesta versão: ver SipRepository.
 */

enum class SipTransport { Udp, Tcp, Tls }

enum class RegistrationState {
    Offline,
    Connecting,
    Registering,
    Registered,
    AuthenticationFailed,
    Error,
}

enum class CallState {
    Ringing,
    Connecting,
    EarlyMedia,
    Active,
    Held,
    Ending,
    Ended,
    Failed,
}

enum class CallDirection { Incoming, Outgoing }

/** Resumo de conta exibido na UI. Nunca carrega a senha. */
data class SipAccountSummary(
    val id: String,
    val label: String,
    val username: String,
    val domain: String,
    val transport: SipTransport,
    val state: RegistrationState,
    val detail: String? = null,
)

/**
 * Dados para criar ou alterar uma conta.
 * Decisão: a senha é mascarada em toString() para não vazar em logs ou em mensagens de depuração.
 */
class SipAccountDraft(
    val label: String,
    val username: String,
    val domain: String,
    val transport: SipTransport,
    val password: String,
    val port: Int? = null,
    val authUsername: String? = null,
    val outboundProxy: String? = null,
) {
    override fun toString(): String =
        "SipAccountDraft(label=$label, username=$username, domain=$domain, transport=$transport, password=***)"
}

data class PhoneCall(
    val id: String,
    val direction: CallDirection,
    val remoteUri: String,
    val displayName: String?,
    val state: CallState,
    val startedAtMillis: Long?,
    val muted: Boolean,
    val held: Boolean,
)

/** Motivo de uma ação não concluída. */
sealed interface SipFailure {
    /** O mecanismo SIP não está integrado nesta versão do aplicativo. */
    data object Unavailable : SipFailure

    /** O mecanismo recusou a ação (por exemplo, número inválido ou estado incompatível). */
    data class Rejected(val reason: String) : SipFailure
}

sealed interface SipResult {
    data object Success : SipResult
    data class Failed(val failure: SipFailure) : SipResult
}
