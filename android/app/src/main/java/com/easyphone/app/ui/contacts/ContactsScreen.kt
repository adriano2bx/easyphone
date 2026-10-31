package com.easyphone.app.ui.contacts

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.easyphone.app.R
import com.easyphone.app.ui.components.EmptyState
import com.easyphone.app.ui.components.ScreenHeader

/**
 * Contatos. Sem permissão de leitura de contatos nesta versão e sem fonte de dados real,
 * a tela mostra apenas o estado vazio (nunca os nomes ilustrativos do mockup).
 */
@Composable
fun ContactsScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        ScreenHeader(title = stringResource(R.string.contacts_title))
        EmptyState(
            icon = Icons.Filled.Contacts,
            title = stringResource(R.string.contacts_empty_title),
            body = stringResource(R.string.contacts_empty_body),
            modifier = Modifier.weight(1f),
        )
    }
}
