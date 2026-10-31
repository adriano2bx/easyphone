package com.easyphone.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.toArgb
import com.easyphone.app.sip.UnavailableSipRepository
import com.easyphone.app.ui.theme.EasyPhoneGraphite
import com.easyphone.app.ui.theme.EasyPhoneTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(EasyPhoneGraphite.toArgb()),
            navigationBarStyle = SystemBarStyle.dark(EasyPhoneGraphite.toArgb()),
        )
        setContent {
            EasyPhoneTheme {
                // Decisão: o repositório real ainda não existe. A UI declara telefonia indisponível
                // em vez de usar um repositório de demonstração. Trocar aqui quando houver implementação SIP.
                val sip = remember { UnavailableSipRepository() }
                EasyPhoneApp(sip = sip)
            }
        }
    }
}
