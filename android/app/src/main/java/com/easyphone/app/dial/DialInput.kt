package com.easyphone.app.dial

/** Limite de caracteres do campo de discagem. Evita entradas acidentais e colagens longas. */
const val MAX_DIAL_LENGTH = 32

/**
 * Mantém apenas caracteres de discagem: dígitos, '*', '#' e '+'.
 *
 * Decisão: a validação de formato real (E.164, plano de numeração da operadora) pertence ao mecanismo SIP.
 * Aqui só filtramos o que o teclado pode produzir, para a UI não depender de regra de telefonia.
 */
fun sanitizeDialInput(raw: String): String =
    raw.filter { it in '0'..'9' || it == '*' || it == '#' || it == '+' }.take(MAX_DIAL_LENGTH)

/** Ligar só faz sentido com número preenchido e telefonia disponível. */
fun canDial(number: String, telephonyAvailable: Boolean): Boolean =
    telephonyAvailable && number.isNotBlank()
