#include <wx/wx.h>
#include <wx/filename.h>
#include <wx/dcmemory.h>
#include <wx/statbmp.h>
#include <wx/statline.h>
#include <wx/scrolwin.h>
#include <wx/stdpaths.h>
#include <wx/textdlg.h>
#include <wx/datectrl.h>
#include <wx/dateevt.h>

#include <nlohmann/json.hpp>
#include <algorithm>
#include <atomic>
#include <functional>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>
#if defined(__WXGTK__)
#include <dlfcn.h>
#endif

using Json = nlohmann::json;

namespace {
const wxColour kApp(32, 34, 37);
const wxColour kSidebar(29, 32, 35);
const wxColour kSurface(36, 39, 43);
const wxColour kSurfaceRaised(44, 48, 52);
const wxColour kInk(240, 241, 238);
const wxColour kMuted(164, 173, 179);
const wxColour kBrand(56, 240, 148);
const wxColour kOnBrand(16, 42, 28);
const wxColour kDanger(200, 56, 71);
constexpr int kActionHeight = 40;
constexpr int kActionFont = 10;
std::mutex gOutputMutex;

bool BeginNativeWindowMove(wxWindow* window, wxWindow* source, wxMouseEvent& event) {
#if defined(__WXGTK__)
  void* gtk = dlopen("libgtk-3.so.0", RTLD_LAZY | RTLD_NOLOAD);
  if (!gtk) return false;
  using BeginMoveDrag = void (*)(void*, int, int, int, unsigned int);
  auto beginMoveDrag = reinterpret_cast<BeginMoveDrag>(dlsym(gtk, "gtk_window_begin_move_drag"));
  if (beginMoveDrag) {
    const wxPoint screen = source->ClientToScreen(event.GetPosition());
    beginMoveDrag(window->GetHandle(), 1, screen.x, screen.y,
                  static_cast<unsigned int>(event.GetTimestamp()));
  }
  dlclose(gtk);
  return beginMoveDrag != nullptr;
#else
  (void)window; (void)source;
  (void)event;
  return false;
#endif
}

wxString U(const char* value) { return wxString::FromUTF8(value); }
wxString S(const Json& value) {
  if (value.is_string()) return wxString::FromUTF8(value.get<std::string>().c_str());
  if (value.is_number()) return wxString::Format("%lld", value.get<long long>());
  if (value.is_boolean()) return value.get<bool>() ? "true" : "false";
  return {};
}

wxString DisplaySipAddress(const Json& value) {
  auto address = S(value).ToStdString();
  const auto scheme = address.find("sips:");
  const auto sipScheme = address.find("sip:");
  const auto telScheme = address.find("tel:");
  if (scheme != std::string::npos) address.erase(0, scheme + 5);
  else if (sipScheme != std::string::npos) address.erase(0, sipScheme + 4);
  else if (telScheme != std::string::npos) address.erase(0, telScheme + 4);
  const auto end = address.find_first_of(";?>");
  if (end != std::string::npos) address.resize(end);
  const auto at = address.rfind('@');
  if (at != std::string::npos) address.resize(at);
  return address.empty() ? U("Chamada SIP") : wxString::FromUTF8(address.c_str());
}

wxString DisplayCaller(const Json& call) {
  const auto displayName = S(call.value("displayName", Json("")));
  const auto display = displayName.ToStdString();
  if (!display.empty()) {
    if (display.find("sip:") != std::string::npos || display.find("sips:") != std::string::npos ||
        display.find("tel:") != std::string::npos)
      return DisplaySipAddress(displayName);
    return displayName;
  }
  return DisplaySipAddress(call.value("remoteUri", Json("Chamada")));
}

wxBitmap Icon(const wxString& name, const wxColour& color = kMuted, int size = 32) {
  wxBitmap bitmap(32, 32, 32);
  wxMemoryDC dc(bitmap);
  dc.SetBackground(wxBrush(wxColour(0, 0, 0, 0)));
  dc.Clear();
  dc.SetPen(wxPen(color, 2));
  dc.SetBrush(*wxTRANSPARENT_BRUSH);
  if (name == "phone") {
    dc.DrawLine(8, 5, 5, 8); dc.DrawLine(5, 8, 6, 12); dc.DrawLine(6, 12, 12, 18);
    dc.DrawLine(12, 18, 17, 20); dc.DrawLine(17, 20, 20, 17); dc.DrawLine(16, 14, 20, 16);
  } else if (name == "contacts") {
    dc.DrawCircle(16, 10, 4); dc.DrawLine(7, 26, 8, 22); dc.DrawLine(8, 22, 12, 19);
    dc.DrawLine(12, 19, 20, 19); dc.DrawLine(20, 19, 24, 22); dc.DrawLine(24, 22, 25, 26);
  } else if (name == "history") {
    dc.DrawCircle(16, 16, 11); dc.DrawLine(16, 8, 16, 16); dc.DrawLine(16, 16, 21, 19);
  } else if (name == "settings") {
    dc.DrawCircle(16, 16, 6); dc.DrawCircle(16, 16, 2);
    dc.DrawLine(16, 2, 16, 6); dc.DrawLine(16, 26, 16, 30);
    dc.DrawLine(2, 16, 6, 16); dc.DrawLine(26, 16, 30, 16);
    dc.DrawLine(6, 6, 9, 9); dc.DrawLine(23, 23, 26, 26);
    dc.DrawLine(26, 6, 23, 9); dc.DrawLine(9, 23, 6, 26);
  } else if (name == "microphone") {
    dc.DrawRoundedRectangle(12, 4, 8, 16, 4); dc.DrawLine(7, 15, 7, 17);
    dc.DrawLine(7, 17, 10, 22); dc.DrawLine(10, 22, 16, 24);
    dc.DrawLine(16, 24, 22, 22); dc.DrawLine(22, 22, 25, 17); dc.DrawLine(25, 17, 25, 15);
    dc.DrawLine(16, 24, 16, 29); dc.DrawLine(11, 29, 21, 29);
  } else if (name == "pause") {
    dc.DrawRoundedRectangle(8, 6, 5, 20, 1); dc.DrawRoundedRectangle(19, 6, 5, 20, 1);
  } else if (name == "transfer") {
    dc.DrawLine(5, 10, 26, 10); dc.DrawLine(22, 6, 26, 10); dc.DrawLine(22, 14, 26, 10);
    dc.DrawLine(27, 22, 6, 22); dc.DrawLine(10, 18, 6, 22); dc.DrawLine(10, 26, 6, 22);
  } else if (name == "keypad") {
    for (int y : {7, 16, 25}) for (int x : {7, 16, 25}) dc.DrawCircle(x, y, 1);
  } else if (name == "backspace") {
    const wxPoint outline[] = {{13, 6}, {26, 6}, {26, 26}, {13, 26}, {5, 16}, {13, 6}};
    dc.DrawLines(6, outline);
    dc.DrawLine(16, 12, 22, 20);
    dc.DrawLine(22, 12, 16, 20);
  } else if (name == "window-minimize") {
    dc.DrawLine(8, 22, 24, 22);
  } else if (name == "window-maximize") {
    dc.DrawRectangle(8, 8, 16, 16);
  } else if (name == "window-close") {
    dc.DrawLine(9, 9, 23, 23); dc.DrawLine(23, 9, 9, 23);
  } else if (name == "headset") {
    dc.DrawLine(5, 16, 5, 12); dc.DrawLine(5, 12, 8, 7); dc.DrawLine(8, 7, 12, 5);
    dc.DrawLine(12, 5, 20, 5); dc.DrawLine(20, 5, 24, 9); dc.DrawLine(24, 9, 27, 14);
    dc.DrawRoundedRectangle(4, 15, 6, 10, 2); dc.DrawRoundedRectangle(22, 15, 6, 10, 2);
  }
  dc.SelectObject(wxNullBitmap);
  if (size == 32) return bitmap;
  auto image = bitmap.ConvertToImage();
  image.Rescale(size, size, wxIMAGE_QUALITY_HIGH);
  return wxBitmap(image);
}

wxStaticText* Label(wxWindow* parent, const wxString& value, int size = 10,
                    const wxColour& colour = kInk, bool bold = false) {
  auto* label = new wxStaticText(parent, wxID_ANY, value);
  label->SetFont(wxFont(size, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL,
                        bold ? wxFONTWEIGHT_SEMIBOLD : wxFONTWEIGHT_NORMAL));
  label->SetForegroundColour(colour);
  return label;
}

wxButton* Button(wxWindow* parent, const wxString& value,
                 const wxSize& size = wxDefaultSize) {
  auto* button = new wxButton(parent, wxID_ANY, value, wxDefaultPosition, size);
  wxSize minSize = size;
  if (minSize.GetHeight() <= 0) minSize.SetHeight(kActionHeight);
  button->SetMinSize(minSize);
  button->SetBackgroundColour(kSurfaceRaised);
  button->SetForegroundColour(kInk);
  button->SetFont(wxFont(kActionFont, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_MEDIUM));
  return button;
}

void BackspaceInput(wxTextCtrl* input) {
  if (!input) return;
  wxString value = input->GetValue();
  if (!value.empty()) value.RemoveLast();
  input->ChangeValue(value);
  const long end = static_cast<long>(value.length());
  input->SetSelection(end, end);
}

wxPanel* Surface(wxWindow* parent, const wxColour& colour = kSurface) {
  auto* panel = new wxPanel(parent);
  panel->SetBackgroundColour(colour);
  return panel;
}

wxString StateLabel(const wxString& state) {
  if (state == "registered") return U("Registrado");
  if (state == "registering" || state == "connecting") return U("Conectando");
  if (state == "authentication-failed") return U("Falha de autenticação");
  if (state == "error") return U("Erro de registro");
  return U("Offline");
}
}

class AccountForm final : public wxDialog {
 public:
  explicit AccountForm(wxWindow* parent)
      : wxDialog(parent, wxID_ANY, U("Adicionar conta SIP"), wxDefaultPosition,
                 wxSize(470, 560), wxDEFAULT_DIALOG_STYLE | wxRESIZE_BORDER) {
    auto* root = new wxBoxSizer(wxVERTICAL);
    auto* grid = new wxFlexGridSizer(2, 10, 10);
    grid->AddGrowableCol(1, 1);

    label_ = AddField(grid, U("Nome da linha"), U("Recepção"));
    username_ = AddField(grid, U("Usuário SIP"), U("1003"));
    authUsername_ = AddField(grid, U("Usuário de autenticação"), U("Igual ao usuário SIP"));
    domain_ = AddField(grid, U("Servidor / domínio"), U("sip.exemplo.com.br"));
    port_ = AddField(grid, U("Porta (opcional)"), U("5060"));
    proxy_ = AddField(grid, U("Proxy de saída (opcional)"), U("proxy.exemplo.com.br"));
    password_ = AddField(grid, U("Senha"), {}, wxTE_PASSWORD);

    grid->Add(Label(this, U("Transporte"), 10, kMuted), 0, wxALIGN_CENTER_VERTICAL);
    transport_ = new wxChoice(this, wxID_ANY);
    transport_->Append("UDP");
    transport_->Append("TCP");
    transport_->Append("TLS");
    transport_->SetSelection(0);
    grid->Add(transport_, 1, wxEXPAND);
    root->Add(grid, 1, wxEXPAND | wxALL, 20);
    root->Add(Label(this, U("A senha é guardada pelo cofre do sistema."), 9, kMuted),
              0, wxLEFT | wxRIGHT | wxBOTTOM, 20);

    auto* buttons = CreateSeparatedButtonSizer(wxOK | wxCANCEL);
    root->Add(buttons, 0, wxEXPAND | wxLEFT | wxRIGHT | wxBOTTOM, 16);
    SetSizerAndFit(root);
    SetMinSize(wxSize(430, 500));
  }

  Json Draft() const {
    const auto portText = port_->GetValue().Trim(true).Trim(false);
    return Json{
        {"label", label_->GetValue().ToStdString()},
        {"username", username_->GetValue().ToStdString()},
        {"authUsername", authUsername_->GetValue().Trim(true).Trim(false).ToStdString()},
        {"domain", domain_->GetValue().Trim(true).Trim(false).ToStdString()},
        {"port", portText.empty() ? Json(nullptr) : Json(wxAtoi(portText))},
        {"outboundProxy", proxy_->GetValue().Trim(true).Trim(false).ToStdString()},
        {"transport", transport_->GetStringSelection().Lower().ToStdString()},
        {"password", password_->GetValue().ToStdString()},
    };
  }

 private:
  wxTextCtrl* label_{};
  wxTextCtrl* username_{};
  wxTextCtrl* authUsername_{};
  wxTextCtrl* domain_{};
  wxTextCtrl* port_{};
  wxTextCtrl* proxy_{};
  wxTextCtrl* password_{};
  wxChoice* transport_{};

  wxTextCtrl* AddField(wxFlexGridSizer* grid, const wxString& label,
                       const wxString& hint, long style = 0) {
    grid->Add(Label(this, label, 10, kMuted), 0, wxALIGN_CENTER_VERTICAL);
    auto* field = new wxTextCtrl(this, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 34), style);
    field->SetHint(hint);
    grid->Add(field, 1, wxEXPAND);
    return field;
  }
};

class PhoneFrame final : public wxFrame {
 public:
  PhoneFrame() : wxFrame(nullptr, wxID_ANY, wxEmptyString, wxDefaultPosition,
                         wxSize(1080, 700), wxRESIZE_BORDER | wxCLIP_CHILDREN), timer_(this), dialResultTimer_(this) {
    SetMinSize(wxSize(920, 600));
    SetBackgroundColour(kApp);
    BuildInterface();
    Bind(wxEVT_CLOSE_WINDOW, &PhoneFrame::OnClose, this);
    Bind(wxEVT_TIMER, &PhoneFrame::OnTimer, this, timer_.GetId());
    Bind(wxEVT_TIMER, &PhoneFrame::OnDialResultTimeout, this, dialResultTimer_.GetId());
    timer_.Start(1000);
    Centre();
  }

  void StartReader() {
    std::thread([this]() {
      std::string line;
      while (!stopping_ && std::getline(std::cin, line)) {
        if (line.size() > 1'000'000) continue;
        try {
          auto message = Json::parse(line);
          CallAfter([this, message = std::move(message)]() { HandleBackendMessage(message); });
        } catch (const std::exception&) {
          // Ignora somente a mensagem truncada; a próxima linha continua sendo lida.
        }
      }
      if (!stopping_) CallAfter([this]() { SetEngineStatus(false, U("Conexão com o processo de telefonia encerrada.")); });
    }).detach();
  }

 private:
  Json snapshot_ = Json::object();
  Json engine_ = Json::object();
  wxTextCtrl* number_{};
  wxTextCtrl* compactNumber_{};
  unsigned long long pendingDialRequestId_{};
  wxButton* compactToggle_{};
  wxBitmapButton* minimizeWindowButton_{};
  wxBitmapButton* maximizeWindowButton_{};
  wxBitmapButton* closeWindowButton_{};
  wxButton* dialButton_{};
  wxButton* compactAction_{};
  wxPanel* navigationPanel_{};
  wxBitmapButton* callsNav_{};
  wxBitmapButton* contactsNav_{};
  wxBitmapButton* recentsNav_{};
  wxPanel* dialerPanel_{};
  wxPanel* recentPanel_{};
  wxPanel* centerContent_{};
  wxPanel* callPanel_{};
  wxPanel* compactPanel_{};
  wxPanel* compactDialPanel_{};
  wxPanel* compactCallPanel_{};
  wxPanel* compactDtmfPanel_{};
  wxStaticText* lineStatus_{};
  wxStaticText* callName_{};
  wxStaticText* callState_{};
  wxStaticText* callDuration_{};
  wxStaticText* compactStatus_{};
  wxStaticText* compactCallAccount_{};
  wxStaticText* compactCallName_{};
  wxStaticText* compactCallStatus_{};
  wxStaticText* compactCallDuration_{};
  wxButton* answerButton_{};
  wxButton* rejectButton_{};
  wxButton* muteButton_{};
  wxButton* holdButton_{};
  wxButton* transferButton_{};
  wxButton* hangupButton_{};
  wxButton* compactMuteButton_{};
  wxButton* compactHoldButton_{};
  wxButton* compactTransferButton_{};
  wxButton* compactDtmfButton_{};
  wxButton* compactAnswerButton_{};
  wxButton* compactRejectButton_{};
  wxButton* compactHangupButton_{};
  wxButton* audioButton_{};
  wxButton* compactAudioButton_{};
  wxButton* compactCallAudioButton_{};
  wxTimer timer_;
  wxTimer dialResultTimer_;
  std::atomic_bool stopping_{false};
  bool compact_ = false;
  bool compactLayoutInitialized_ = false;
  bool compactCallView_ = false;
  bool draggingWindow_ = false;
  wxWindow* dragSource_{};
  wxPoint dragStartPointer_{};
  wxPoint dragStartWindow_{};
  std::string incomingPopupCallId_;
  enum class CenterPage { Calls, Contacts, Recents };
  CenterPage centerPage_ = CenterPage::Recents;
  int historyDirectionFilter_ = 0;
  bool historyDateFilterEnabled_ = false;
  wxDateTime historyFrom_ = wxDateTime::Today();
  wxDateTime historyTo_ = wxDateTime::Today();
  unsigned long long nextRequestId_ = 1;
  unsigned long long audioRefreshRequestId_ = 0;

  void BuildInterface() {
    auto* root = new wxBoxSizer(wxVERTICAL);
    root->Add(BuildTopBar(), 0, wxEXPAND);
    auto* workspace = new wxBoxSizer(wxHORIZONTAL);
    navigationPanel_ = BuildNavigation();
    workspace->Add(navigationPanel_, 0, wxEXPAND);
    dialerPanel_ = BuildDialer();
    workspace->Add(dialerPanel_, 0, wxEXPAND);
    recentPanel_ = BuildRecents();
    workspace->Add(recentPanel_, 1, wxEXPAND);
    callPanel_ = BuildCallPanel();
    callPanel_->Hide();
    workspace->Add(callPanel_, 1, wxEXPAND);
    compactPanel_ = BuildCompactPanel();
    compactPanel_->Hide();
    workspace->Add(compactPanel_, 1, wxEXPAND);
    root->Add(workspace, 1, wxEXPAND);
    SetSizer(root);
  }

  wxPanel* BuildTopBar() {
    auto* bar = Surface(this, wxColour(35, 38, 42));
    auto* row = new wxBoxSizer(wxHORIZONTAL);
    auto* brand = Surface(bar, wxColour(35, 38, 42));
    auto* brandRow = new wxBoxSizer(wxHORIZONTAL);
    wxStaticBitmap* logoWidget = nullptr;
    const wxString logoPath = wxFileName(wxStandardPaths::Get().GetExecutablePath())
                                  .GetPathWithSep() + "assets/easyphone-logo-negative.png";
    if (wxFileExists(logoPath)) {
      wxImage image(logoPath, wxBITMAP_TYPE_PNG);
      if (image.IsOk()) {
        image.Rescale(192, 48, wxIMAGE_QUALITY_HIGH);
        logoWidget = new wxStaticBitmap(brand, wxID_ANY, wxBitmap(image));
        brandRow->Add(logoWidget, 0,
                      wxALIGN_CENTER_VERTICAL | wxLEFT, 13);
      }
    }
    brand->SetSizer(brandRow);
    brand->SetMinSize(wxSize(228, 60));
    row->Add(brand, 0, wxEXPAND);
    row->AddStretchSpacer();
    compactToggle_ = Button(bar, U("Compacto"));
    compactToggle_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { ToggleCompact(); });
    row->Add(compactToggle_, 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 6);
    const auto makeWindowButton = [bar](const wxString& icon, const wxString& tooltip) {
      auto* button = new wxBitmapButton(bar, wxID_ANY, Icon(icon, kMuted, 18),
                                        wxDefaultPosition, wxSize(28, 28), wxBORDER_NONE);
      button->SetBackgroundColour(wxColour(35, 38, 42));
      button->SetToolTip(tooltip);
      return button;
    };
    minimizeWindowButton_ = makeWindowButton(U("window-minimize"), U("Minimizar"));
    maximizeWindowButton_ = makeWindowButton(U("window-maximize"), U("Maximizar"));
    closeWindowButton_ = makeWindowButton(U("window-close"), U("Fechar"));
    minimizeWindowButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Iconize(true); });
    maximizeWindowButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { if (!compact_) Maximize(!IsMaximized()); });
    closeWindowButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Close(); });
    for (auto* button : {minimizeWindowButton_, maximizeWindowButton_, closeWindowButton_})
      row->Add(button, 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 2);
    row->AddSpacer(8);
    BindWindowDrag(bar);
    BindWindowDrag(brand);
    if (logoWidget) BindWindowDrag(logoWidget);
    bar->SetSizer(row);
    bar->SetMinSize(wxSize(-1, 60));
    return bar;
  }

  void BindWindowDrag(wxWindow* source) {
    source->Bind(wxEVT_LEFT_DOWN, [this, source](wxMouseEvent& event) {
      if (BeginNativeWindowMove(this, source, event)) return;
      draggingWindow_ = true;
      dragSource_ = source;
      dragStartPointer_ = wxGetMousePosition();
      dragStartWindow_ = GetPosition();
      source->CaptureMouse();
    });
    source->Bind(wxEVT_MOTION, [this](wxMouseEvent& event) {
      if (draggingWindow_ && event.Dragging() && event.LeftIsDown())
        Move(dragStartWindow_ + (wxGetMousePosition() - dragStartPointer_));
      else event.Skip();
    });
    source->Bind(wxEVT_LEFT_UP, [this](wxMouseEvent& event) {
      if (draggingWindow_) {
        draggingWindow_ = false;
        if (dragSource_ && dragSource_->HasCapture()) dragSource_->ReleaseMouse();
        dragSource_ = nullptr;
      } else event.Skip();
    });
  }

  wxPanel* BuildNavigation() {
    auto* rail = Surface(this, kSidebar);
    rail->SetMinSize(wxSize(56, -1));
    auto* column = new wxBoxSizer(wxVERTICAL);
    column->AddSpacer(12);
    callsNav_ = AddRailButton(rail, column, U("phone"), U("Chamadas"), false,
                  [this]() { SelectPage(CenterPage::Calls); });
    contactsNav_ = AddRailButton(rail, column, U("contacts"), U("Contatos"), false,
                  [this]() { SelectPage(CenterPage::Contacts); });
    recentsNav_ = AddRailButton(rail, column, U("history"), U("Recentes"), true,
                  [this]() { SelectPage(CenterPage::Recents); });
    column->AddStretchSpacer();
    AddRailButton(rail, column, U("settings"), U("Configurações"), false,
                  [this]() { ShowSettings(); });
    column->AddSpacer(4);
    rail->SetSizer(column);
    UpdateNavigationSelection();
    return rail;
  }

  wxBitmapButton* AddRailButton(wxWindow* parent, wxSizer* column, const wxString& iconName,
                     const wxString& accessibleName, bool selected,
                     std::function<void()> action = {}) {
    auto* button = new wxBitmapButton(parent, wxID_ANY, Icon(iconName, selected ? kOnBrand : kMuted),
                                      wxDefaultPosition, wxSize(44, 42), wxBORDER_NONE);
    button->SetToolTip(accessibleName);
    button->SetFont(wxFont(17, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
    button->SetBackgroundColour(selected ? kBrand : kSidebar);
    button->SetForegroundColour(selected ? kOnBrand : kMuted);
    if (action) button->Bind(wxEVT_BUTTON, [action](wxCommandEvent&) { action(); });
    column->Add(button, 0, wxALIGN_CENTER_HORIZONTAL | wxBOTTOM, 7);
    return button;
  }

  void SelectPage(CenterPage page) {
    centerPage_ = page;
    UpdateNavigationSelection();
    UpdateInterface();
  }

  void UpdateNavigationSelection() {
    const auto update = [](wxBitmapButton* button, const wxString& icon, bool selected) {
      if (!button) return;
      button->SetBitmapLabel(Icon(icon, selected ? kOnBrand : kMuted));
      button->SetBackgroundColour(selected ? kBrand : kSidebar);
      button->SetForegroundColour(selected ? kOnBrand : kMuted);
      button->Refresh();
    };
    update(callsNav_, U("phone"), centerPage_ == CenterPage::Calls);
    update(contactsNav_, U("contacts"), centerPage_ == CenterPage::Contacts);
    update(recentsNav_, U("history"), centerPage_ == CenterPage::Recents);
  }

  wxPanel* BuildDialer() {
    auto* panel = Surface(this, kSidebar);
    panel->SetMinSize(wxSize(286, -1));
    auto* body = new wxBoxSizer(wxVERTICAL);
    body->Add(Label(panel, U("Chamadas"), 18, kInk, true), 0, wxLEFT | wxTOP, 20);
    body->Add(Label(panel, U("CONTA SIP"), 9, kMuted, true), 0, wxLEFT | wxTOP, 20);
    auto* status = new wxPanel(panel);
    status->SetBackgroundColour(kSurface);
    auto* statusRow = new wxBoxSizer(wxHORIZONTAL);
    lineStatus_ = Label(status, U("Sem conta SIP"), 9, kMuted);
    statusRow->Add(lineStatus_, 1, wxALIGN_CENTER_VERTICAL | wxLEFT | wxRIGHT, 11);
    status->SetSizer(statusRow);
    status->SetMinSize(wxSize(-1, 36));
    body->Add(status, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 16);

    number_ = new wxTextCtrl(panel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 42), wxTE_PROCESS_ENTER);
    number_->SetHint(U("Pesquisar ou discar"));
    number_->SetBackgroundColour(kSurface);
    number_->SetForegroundColour(kInk);
    number_->SetFont(wxFont(13, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
    number_->Bind(wxEVT_TEXT_ENTER, &PhoneFrame::OnDial, this);
    auto* numberRow = new wxBoxSizer(wxHORIZONTAL);
    numberRow->Add(number_, 1, wxEXPAND | wxRIGHT, 6);
    auto* eraseNumber = new wxBitmapButton(panel, wxID_ANY, Icon("backspace", kMuted, 20),
                                           wxDefaultPosition, wxSize(42, 42));
    eraseNumber->SetBackgroundColour(kSurface);
    eraseNumber->SetCanFocus(false);
    eraseNumber->SetToolTip(U("Apagar o último caractere"));
    eraseNumber->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { BackspaceInput(number_); });
    numberRow->Add(eraseNumber, 0, wxEXPAND);
    body->Add(numberRow, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 16);

    auto* keypadPanel = new wxPanel(panel);
    keypadPanel->SetBackgroundColour(panel->GetBackgroundColour());
    auto* keypad = new wxGridSizer(4, 3, 5, 5);
    const wxString keys[] = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"};
    for (const auto& key : keys) {
      auto* button = Button(keypadPanel, key, wxSize(-1, 48));
      button->SetFont(wxFont(16, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_MEDIUM));
      button->Bind(wxEVT_BUTTON, [this, key](wxCommandEvent&) {
        if (HasCall()) Send("sendDtmf", {snapshot_["call"]["id"], key.ToStdString()});
        else number_->AppendText(key);
      });
      keypad->Add(button, 1, wxEXPAND);
    }
    keypadPanel->SetSizer(keypad);
    body->Add(keypadPanel, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 16);

    dialButton_ = Button(panel, U("Ligar"), wxSize(-1, kActionHeight));
    dialButton_->SetBackgroundColour(kBrand);
    dialButton_->SetForegroundColour(kOnBrand);
    dialButton_->SetFont(wxFont(11, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD));
    dialButton_->Bind(wxEVT_BUTTON, &PhoneFrame::OnDial, this);
    body->Add(dialButton_, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 16);
    body->AddStretchSpacer();
    audioButton_ = Button(panel, U("Áudio do sistema"), wxSize(-1, kActionHeight));
    audioButton_->SetBitmap(Icon("headset", kMuted, 18));
    audioButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { ShowAudioSettings(); });
    body->Add(audioButton_, 0, wxEXPAND | wxLEFT | wxRIGHT | wxBOTTOM, 12);
    panel->SetSizer(body);
    return panel;
  }

  wxPanel* BuildRecents() {
    auto* panel = Surface(this, kApp);
    auto* body = new wxBoxSizer(wxVERTICAL);
    centerContent_ = new wxPanel(panel);
    centerContent_->SetBackgroundColour(kApp);
    body->Add(centerContent_, 1, wxEXPAND);
    panel->SetSizer(body);
    return panel;
  }

  void RebuildCenterPage() {
    if (!centerContent_) return;
    centerContent_->Freeze();
    if (auto* old = centerContent_->GetSizer()) {
      centerContent_->SetSizer(nullptr, false);
      old->Clear(true);
      delete old;
    }
    auto* body = new wxBoxSizer(wxVERTICAL);
    const auto title = centerPage_ == CenterPage::Contacts ? U("Contatos") :
                       centerPage_ == CenterPage::Calls ? U("Chamadas") : U("Recentes");
    auto* heading = new wxBoxSizer(wxHORIZONTAL);
    heading->Add(Label(centerContent_, title, 18, kInk, true), 0, wxALIGN_CENTER_VERTICAL);
    heading->AddStretchSpacer();
    if (centerPage_ == CenterPage::Contacts) {
      auto* add = Button(centerContent_, U("Adicionar contato"));
      add->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
        wxTextEntryDialog nameDialog(this, U("Nome do contato"), U("Novo contato"));
        if (nameDialog.ShowModal() != wxID_OK || nameDialog.GetValue().Trim(true).Trim(false).empty()) return;
        wxTextEntryDialog numberDialog(this, U("Telefone ou URI SIP"), U("Novo contato"));
        if (numberDialog.ShowModal() != wxID_OK || numberDialog.GetValue().Trim(true).Trim(false).empty()) return;
        Send("saveContact", {Json{{"name", nameDialog.GetValue().ToStdString()}, {"number", numberDialog.GetValue().ToStdString()}}});
      });
      heading->Add(add, 0, wxALIGN_CENTER_VERTICAL);
    } else if (centerPage_ == CenterPage::Recents) {
      auto* clear = Button(centerContent_, U("Limpar histórico"));
      clear->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Send("clearCallHistory"); });
      heading->Add(clear, 0);
    }
    body->Add(heading, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 22);
    body->Add(new wxStaticLine(centerContent_), 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 16);
    if (centerPage_ == CenterPage::Recents) {
      auto* filters = new wxBoxSizer(wxHORIZONTAL);
      filters->Add(Label(centerContent_, U("Tipo"), 9, kMuted), 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 6);
      auto* direction = new wxChoice(centerContent_, wxID_ANY);
      direction->Append(U("Todas"));
      direction->Append(U("Recebidas"));
      direction->Append(U("Realizadas"));
      direction->Append(U("Perdidas"));
      direction->SetSelection(historyDirectionFilter_);
      filters->Add(direction, 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 12);
      auto* dateEnabled = new wxCheckBox(centerContent_, wxID_ANY, U("Período"));
      dateEnabled->SetValue(historyDateFilterEnabled_);
      filters->Add(dateEnabled, 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 6);
      auto* from = new wxDatePickerCtrl(centerContent_, wxID_ANY, historyFrom_, wxDefaultPosition,
                                        wxSize(132, -1), wxDP_DROPDOWN | wxDP_SHOWCENTURY);
      auto* to = new wxDatePickerCtrl(centerContent_, wxID_ANY, historyTo_, wxDefaultPosition,
                                      wxSize(132, -1), wxDP_DROPDOWN | wxDP_SHOWCENTURY);
      from->Enable(historyDateFilterEnabled_);
      to->Enable(historyDateFilterEnabled_);
      filters->Add(Label(centerContent_, U("De"), 9, kMuted), 0, wxALIGN_CENTER_VERTICAL | wxLEFT | wxRIGHT, 4);
      filters->Add(from, 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 6);
      filters->Add(Label(centerContent_, U("até"), 9, kMuted), 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 4);
      filters->Add(to, 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 8);
      auto* applyFilters = Button(centerContent_, U("Filtrar"));
      applyFilters->Bind(wxEVT_BUTTON, [this, direction, dateEnabled, from, to](wxCommandEvent&) {
        historyDirectionFilter_ = direction->GetSelection();
        historyDateFilterEnabled_ = dateEnabled->GetValue();
        historyFrom_ = from->GetValue();
        historyTo_ = to->GetValue();
        RebuildCenterPage();
      });
      dateEnabled->Bind(wxEVT_CHECKBOX, [from, to](wxCommandEvent& event) {
        from->Enable(event.IsChecked());
        to->Enable(event.IsChecked());
      });
      filters->AddStretchSpacer(1);
      filters->Add(applyFilters, 0, wxALIGN_CENTER_VERTICAL);
      body->Add(filters, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 16);
    }
    auto* listPanel = new wxScrolledWindow(centerContent_, wxID_ANY, wxDefaultPosition,
                                           wxDefaultSize, wxVSCROLL | wxBORDER_NONE);
    listPanel->SetBackgroundColour(kApp);
    listPanel->SetScrollRate(0, 16);
    auto* list = new wxBoxSizer(wxVERTICAL);
    if (centerPage_ == CenterPage::Contacts) {
      const auto contacts = snapshot_.value("contacts", Json::array());
      for (const auto& item : contacts) {
        auto* row = new wxBoxSizer(wxHORIZONTAL);
        auto* labels = new wxBoxSizer(wxVERTICAL);
        labels->Add(Label(listPanel, S(item.value("name", Json("Contato"))), 11, kInk, true), 0, wxBOTTOM, 3);
        labels->Add(Label(listPanel, S(item.value("number", Json(""))), 9, kMuted), 0);
        row->Add(labels, 1, wxALIGN_CENTER_VERTICAL);
        auto* dial = Button(listPanel, U("Ligar"));
        dial->Bind(wxEVT_BUTTON, [this, n=DisplaySipAddress(S(item.value("number", Json(""))))](wxCommandEvent&) {
          StartDial(n);
        });
        auto* remove = Button(listPanel, U("Excluir"));
        remove->Bind(wxEVT_BUTTON, [this, id=S(item.value("id", Json("")))](wxCommandEvent&) { Send("deleteContact", {id.ToStdString()}); });
        row->Add(dial, 0, wxLEFT, 8); row->Add(remove, 0, wxLEFT, 6);
        list->Add(row, 0, wxEXPAND | wxALL, 12);
        list->Add(new wxStaticLine(listPanel), 0, wxEXPAND | wxLEFT | wxRIGHT, 12);
      }
      if (contacts.empty()) list->Add(Label(listPanel, U("Sua lista de contatos aparecerá aqui."), 10, kMuted), 0, wxALIGN_CENTER | wxALL, 36);
    } else if (centerPage_ == CenterPage::Recents) {
      const auto history = snapshot_.value("callHistory", Json::array());
      const auto visibleHistory = [this](const Json& item) {
        const auto state = S(item.value("state", Json("")));
        const auto direction = S(item.value("direction", Json("outgoing")));
        const auto duration = item.value("durationSeconds", 0);
        const bool missed = state == "missed" || (direction == "incoming" && state == "ended" && duration == 0);
        if (historyDirectionFilter_ == 1 && direction != "incoming") return false;
        if (historyDirectionFilter_ == 2 && direction != "outgoing") return false;
        if (historyDirectionFilter_ == 3 && !missed) return false;
        if (historyDateFilterEnabled_) {
          const auto stamp = S(item.value("startedAt", Json("")));
          wxDateTime callDate;
          if (stamp.length() < 19 || !callDate.ParseISOCombined(stamp.Left(19))) return false;
          callDate.MakeFromTimezone(wxDateTime::UTC);
          const auto date = callDate.FormatISODate();
          auto fromDate = historyFrom_.FormatISODate();
          auto toDate = historyTo_.FormatISODate();
          if (fromDate > toDate) std::swap(fromDate, toDate);
          return date >= fromDate && date <= toDate;
        }
        return true;
      };
      for (const auto& item : history) {
        if (!visibleHistory(item)) continue;
        const auto state = S(item.value("state", Json("")));
        const auto direction = S(item.value("direction", Json("outgoing")));
        const auto duration = item.value("durationSeconds", 0);
        const bool missed = state == "missed" || (direction == "incoming" && state == "ended" && duration == 0);
        auto* card = Surface(listPanel, kSurface);
        auto* row = new wxBoxSizer(wxHORIZONTAL);
        const auto iconColor = missed ? kDanger : (direction == "incoming" ? kBrand : kMuted);
        auto* directionIcon = new wxStaticBitmap(card, wxID_ANY, Icon("phone", iconColor, 20));
        row->Add(directionIcon, 0, wxALIGN_CENTER_VERTICAL | wxLEFT | wxRIGHT, 12);
        auto* labels = new wxBoxSizer(wxVERTICAL);
        const auto contactName = S(item.value("displayName", Json("")));
        const auto destination = S(item.value("displayDestination", Json("")));
        labels->Add(Label(card, contactName.empty() ? (destination.empty() ? U("Chamada") : destination) : contactName, 11, kInk, true), 0, wxBOTTOM, 3);
        if (!contactName.empty() && !destination.empty())
          labels->Add(Label(card, destination, 9, kMuted), 0, wxBOTTOM, 3);
        wxString outcome;
        if (state == "missed") outcome = U("Perdida");
        else if (state == "rejected") outcome = U("Recusada");
        else if (state == "failed") outcome = U("Falhou");
        else if (duration > 0) outcome = direction == "incoming" ? U("Atendida") : U("Concluída");
        else outcome = direction == "incoming" ? U("Não atendida") : U("Não completada");
        wxString details = direction == "incoming" ? U("Recebida") : U("Realizada");
        details += U("  ·  ") + outcome;
        const auto displayTime = S(item.value("displayTime", Json("")));
        if (!displayTime.empty()) details += U("  ·  ") + displayTime;
        if (duration > 0) {
          const auto minutes = duration / 60;
          const auto seconds = duration % 60;
          details += U("  ·  ") + wxString::Format("%02d:%02d", minutes, seconds);
        }
        const auto detailsColor = (missed || state == "failed" || state == "rejected") ? kDanger :
                                  (duration > 0 ? kBrand : kMuted);
        labels->Add(Label(card, details, 9, detailsColor), 0);
        row->Add(labels, 1, wxALIGN_CENTER_VERTICAL);
        auto* dial = Button(card, U("Ligar"), wxSize(88, kActionHeight));
        dial->SetBackgroundColour(kBrand);
        dial->SetForegroundColour(kOnBrand);
        dial->SetFont(wxFont(11, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD));
        dial->Bind(wxEVT_BUTTON, [this, n=DisplaySipAddress(S(item.value("destination", Json(""))))](wxCommandEvent&) {
          StartDial(n);
        });
        row->Add(dial, 0, wxALIGN_CENTER_VERTICAL | wxLEFT | wxRIGHT, 12);
        card->SetSizer(row);
        list->Add(card, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 5);
      }
      if (std::none_of(history.begin(), history.end(), visibleHistory))
        list->Add(Label(listPanel, U("Nenhuma chamada neste filtro."), 10, kMuted), 0, wxALIGN_CENTER | wxALL, 36);
    } else {
      list->Add(Label(listPanel, U("Use o teclado à esquerda para iniciar uma chamada."), 11, kMuted), 0, wxALIGN_CENTER | wxALL, 36);
    }
    list->AddSpacer(16);
    listPanel->SetSizer(list);
    body->Add(listPanel, 1, wxEXPAND | wxLEFT | wxRIGHT | wxTOP | wxBOTTOM, 8);
    centerContent_->SetSizer(body);
    centerContent_->Layout();
    listPanel->FitInside();
    centerContent_->Thaw();
  }

  wxPanel* BuildCallPanel() {
    auto* panel = Surface(this, kApp);
    auto* body = new wxBoxSizer(wxVERTICAL);
    auto* heading = new wxBoxSizer(wxHORIZONTAL);
    heading->Add(Label(panel, U("Chamada"), 18, kInk, true), 0, wxALIGN_CENTER_VERTICAL);
    heading->AddStretchSpacer();
    callDuration_ = Label(panel, "00:00", 15, kInk, true);
    heading->Add(callDuration_, 0, wxALIGN_CENTER_VERTICAL);
    body->Add(heading, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 24);
    body->Add(new wxStaticLine(panel), 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 20);

    auto* center = new wxBoxSizer(wxVERTICAL);
    center->AddStretchSpacer();
    callName_ = Label(panel, "", 22, kInk, true);
    center->Add(callName_, 0, wxALIGN_CENTER_HORIZONTAL | wxBOTTOM, 9);
    callState_ = Label(panel, "", 10, kMuted);
    center->Add(callState_, 0, wxALIGN_CENTER_HORIZONTAL | wxBOTTOM, 20);

    auto* incoming = new wxBoxSizer(wxHORIZONTAL);
    answerButton_ = Button(panel, U("Atender"), wxSize(112, kActionHeight));
    answerButton_->SetBackgroundColour(kBrand);
    answerButton_->SetForegroundColour(kOnBrand);
    answerButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { if (HasCall()) Send("answer", {snapshot_["call"]["id"]}); });
    rejectButton_ = Button(panel, U("Recusar"), wxSize(112, kActionHeight));
    rejectButton_->SetBackgroundColour(kDanger);
    rejectButton_->SetForegroundColour(*wxWHITE);
    rejectButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { if (HasCall()) Send("reject", {snapshot_["call"]["id"]}); });
    incoming->Add(answerButton_, 0, wxRIGHT, 10);
    incoming->Add(rejectButton_);
    center->Add(incoming, 0, wxALIGN_CENTER_HORIZONTAL | wxBOTTOM, 20);

    auto* controls = new wxBoxSizer(wxHORIZONTAL);
    muteButton_ = Button(panel, U("Silenciar"), wxSize(112, kActionHeight));
    muteButton_->SetBitmap(Icon("microphone", kMuted, 20));
    muteButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
      if (HasCall()) Send("setMuted", {snapshot_["call"]["id"], !snapshot_["call"].value("muted", false)});
    });
    holdButton_ = Button(panel, U("Espera"), wxSize(112, kActionHeight));
    holdButton_->SetBitmap(Icon("pause", kMuted, 20));
    holdButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
      if (HasCall()) Send("setHeld", {snapshot_["call"]["id"], !snapshot_["call"].value("held", false)});
    });
    transferButton_ = Button(panel, U("Transferir"), wxSize(112, kActionHeight));
    transferButton_->SetBitmap(Icon("transfer", kMuted, 20));
    transferButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { TransferCall(); });
    hangupButton_ = Button(panel, U("Encerrar"), wxSize(112, kActionHeight));
    hangupButton_->SetBackgroundColour(kDanger);
    hangupButton_->SetForegroundColour(*wxWHITE);
    hangupButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { if (HasCall()) Send("hangup", {snapshot_["call"]["id"]}); });
    controls->Add(muteButton_, 0, wxRIGHT, 8);
    controls->Add(holdButton_, 0, wxRIGHT, 8);
    controls->Add(transferButton_, 0, wxRIGHT, 8);
    controls->Add(hangupButton_);
    center->Add(controls, 0, wxALIGN_CENTER_HORIZONTAL);
    center->AddStretchSpacer();
    body->Add(center, 1, wxEXPAND | wxALL, 20);
    panel->SetSizer(body);
    return panel;
  }

  wxPanel* BuildCompactPanel() {
    auto* panel = Surface(this, kApp);
    auto* root = new wxBoxSizer(wxVERTICAL);

    compactDialPanel_ = Surface(panel, kApp);
    auto* dial = new wxBoxSizer(wxVERTICAL);
    compactStatus_ = Label(compactDialPanel_, U("Conta não conectada"), 10, kMuted);
    dial->Add(compactStatus_, 0, wxLEFT | wxRIGHT | wxTOP, 16);
    compactNumber_ = new wxTextCtrl(compactDialPanel_, wxID_ANY, "", wxDefaultPosition,
                                    wxSize(-1, 42), wxTE_PROCESS_ENTER);
    compactNumber_->SetHint(U("Pesquisar ou discar"));
    compactNumber_->SetBackgroundColour(kSurfaceRaised);
    compactNumber_->SetForegroundColour(kInk);
    compactNumber_->Bind(wxEVT_TEXT_ENTER, &PhoneFrame::OnDial, this);
    auto* compactNumberRow = new wxBoxSizer(wxHORIZONTAL);
    compactNumberRow->Add(compactNumber_, 1, wxEXPAND | wxRIGHT, 6);
    auto* compactEraseNumber = new wxBitmapButton(compactDialPanel_, wxID_ANY,
                                                  Icon("backspace", kMuted, 20),
                                                  wxDefaultPosition, wxSize(42, 42));
    compactEraseNumber->SetBackgroundColour(kSurfaceRaised);
    compactEraseNumber->SetCanFocus(false);
    compactEraseNumber->SetToolTip(U("Apagar o último caractere"));
    compactEraseNumber->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { BackspaceInput(compactNumber_); });
    compactNumberRow->Add(compactEraseNumber, 0, wxEXPAND);
    dial->Add(compactNumberRow, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 16);
    auto* keypadPanel = new wxPanel(compactDialPanel_);
    keypadPanel->SetBackgroundColour(kApp);
    auto* keypad = new wxGridSizer(4, 3, 6, 6);
    const wxString keys[] = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"};
    for (const auto& keyLabel : keys) {
      auto* key = Button(keypadPanel, keyLabel, wxSize(-1, 48));
      key->SetFont(wxFont(16, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_MEDIUM));
      key->Bind(wxEVT_BUTTON, [this, keyLabel](wxCommandEvent&) {
        const auto digit = keyLabel.BeforeFirst('\n');
        if (HasCall()) Send("sendDtmf", {snapshot_["call"]["id"], digit.ToStdString()});
        else compactNumber_->AppendText(digit);
      });
      keypad->Add(key, 1, wxEXPAND);
    }
    keypadPanel->SetSizer(keypad);
    dial->Add(keypadPanel, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 16);
    compactAction_ = Button(compactDialPanel_, U("Ligar"), wxSize(-1, kActionHeight));
    compactAction_->SetBackgroundColour(kBrand);
    compactAction_->SetForegroundColour(kOnBrand);
    compactAction_->SetFont(wxFont(11, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD));
    compactAction_->Bind(wxEVT_BUTTON, &PhoneFrame::OnDial, this);
    dial->Add(compactAction_, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 16);
    compactAudioButton_ = Button(compactDialPanel_, U("Áudio do sistema"), wxSize(-1, kActionHeight));
    compactAudioButton_->SetBitmap(Icon("headset", kMuted, 18));
    compactAudioButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { ShowAudioSettings(); });
    dial->Add(compactAudioButton_, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP | wxBOTTOM, 12);
    dial->AddStretchSpacer();
    compactDialPanel_->SetSizer(dial);

    compactCallPanel_ = Surface(panel, kApp);
    auto* call = new wxBoxSizer(wxVERTICAL);
    compactCallAccount_ = Label(compactCallPanel_, "", 10, kMuted);
    call->Add(compactCallAccount_, 0, wxLEFT | wxRIGHT | wxTOP, 16);
    compactCallName_ = Label(compactCallPanel_, "", 20, kInk, true);
    call->Add(compactCallName_, 0, wxALIGN_CENTER_HORIZONTAL | wxTOP, 26);
    compactCallStatus_ = Label(compactCallPanel_, "", 11, kMuted);
    call->Add(compactCallStatus_, 0, wxALIGN_CENTER_HORIZONTAL | wxTOP, 8);
    compactCallDuration_ = Label(compactCallPanel_, "00:00", 16, kInk, true);
    call->Add(compactCallDuration_, 0, wxALIGN_CENTER_HORIZONTAL | wxTOP, 8);
    compactDtmfPanel_ = new wxPanel(compactCallPanel_);
    compactDtmfPanel_->SetBackgroundColour(kApp);
    auto* dtmf = new wxGridSizer(4, 3, 4, 4);
    const wxString dtmfKeys[] = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"};
    for (const auto& digit : dtmfKeys) {
      auto* key = Button(compactDtmfPanel_, digit, wxSize(-1, 48));
      key->SetFont(wxFont(16, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_MEDIUM));
      key->Bind(wxEVT_BUTTON, [this, digit](wxCommandEvent&) {
        if (HasCall()) Send("sendDtmf", {snapshot_["call"]["id"], digit.ToStdString()});
      });
      dtmf->Add(key, 1, wxEXPAND);
    }
    compactDtmfPanel_->SetSizer(dtmf);
    compactDtmfPanel_->Hide();
    call->Add(compactDtmfPanel_, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 14);

    auto* controls = new wxGridSizer(1, 4, 6, 6);
    compactMuteButton_ = Button(compactCallPanel_, U("Mudo"), wxSize(-1, kActionHeight));
    compactHoldButton_ = Button(compactCallPanel_, U("Espera"), wxSize(-1, kActionHeight));
    compactTransferButton_ = Button(compactCallPanel_, U("Transf."), wxSize(-1, kActionHeight));
    compactDtmfButton_ = Button(compactCallPanel_, U("Teclado"), wxSize(-1, kActionHeight));
    compactMuteButton_->SetBitmap(Icon("microphone", kMuted, 18));
    compactHoldButton_->SetBitmap(Icon("pause", kMuted, 18));
    compactTransferButton_->SetBitmap(Icon("transfer", kMuted, 18));
    compactDtmfButton_->SetBitmap(Icon("keypad", kMuted, 18));
    compactMuteButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
      if (HasCall()) Send("setMuted", {snapshot_["call"]["id"], !snapshot_["call"].value("muted", false)});
    });
    compactHoldButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
      if (HasCall()) Send("setHeld", {snapshot_["call"]["id"], !snapshot_["call"].value("held", false)});
    });
    compactTransferButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { TransferCall(); });
    compactDtmfButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
      const bool show = !compactDtmfPanel_->IsShown();
      compactDtmfPanel_->Show(show);
      compactDtmfButton_->SetLabel(show ? U("Fechar") : U("Teclado"));
      FitCompactWindow();
    });
    controls->Add(compactMuteButton_, 1, wxEXPAND);
    controls->Add(compactHoldButton_, 1, wxEXPAND);
    controls->Add(compactTransferButton_, 1, wxEXPAND);
    controls->Add(compactDtmfButton_, 1, wxEXPAND);
    call->Add(controls, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 14);
    auto* incoming = new wxBoxSizer(wxHORIZONTAL);
    compactAnswerButton_ = Button(compactCallPanel_, U("Atender"), wxSize(-1, kActionHeight));
    compactAnswerButton_->SetBackgroundColour(kBrand);
    compactAnswerButton_->SetForegroundColour(kOnBrand);
    compactAnswerButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
      if (HasCall()) Send("answer", {snapshot_["call"]["id"]});
    });
    compactRejectButton_ = Button(compactCallPanel_, U("Encerrar"), wxSize(-1, kActionHeight));
    compactRejectButton_->SetBackgroundColour(kDanger);
    compactRejectButton_->SetForegroundColour(*wxWHITE);
    compactRejectButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
      if (HasCall()) Send("reject", {snapshot_["call"]["id"]});
    });
    incoming->Add(compactAnswerButton_, 1, wxRIGHT, 8);
    incoming->Add(compactRejectButton_, 1);
    call->Add(incoming, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 14);
    compactHangupButton_ = Button(compactCallPanel_, U("Encerrar"), wxSize(-1, kActionHeight));
    compactHangupButton_->SetBackgroundColour(kDanger);
    compactHangupButton_->SetForegroundColour(*wxWHITE);
    compactHangupButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
      if (HasCall()) Send("hangup", {snapshot_["call"]["id"]});
    });
    call->Add(compactHangupButton_, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP, 14);
    compactCallAudioButton_ = Button(compactCallPanel_, U("Áudio do sistema"), wxSize(-1, kActionHeight));
    compactCallAudioButton_->SetBitmap(Icon("headset", kMuted, 18));
    compactCallAudioButton_->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { ShowAudioSettings(); });
    call->Add(compactCallAudioButton_, 0, wxEXPAND | wxLEFT | wxRIGHT | wxTOP | wxBOTTOM, 12);
    call->AddStretchSpacer();
    compactCallPanel_->SetSizer(call);
    compactCallPanel_->Hide();

    root->Add(compactDialPanel_, 1, wxEXPAND);
    root->Add(compactCallPanel_, 1, wxEXPAND);
    panel->SetSizer(root);
    panel->SetMinSize(wxSize(360, -1));
    return panel;
  }

  bool HasCall() const { return snapshot_.contains("call") && snapshot_["call"].is_object(); }

  unsigned long long Send(const std::string& action, Json args = Json::array()) {
    const auto id = nextRequestId_++;
    Json request{{"id", id}, {"action", action}, {"args", std::move(args)}};
    std::lock_guard<std::mutex> lock(gOutputMutex);
    std::cout << request.dump() << '\n' << std::flush;
    return id;
  }

  void ClearDialInputs() {
    if (number_) number_->ChangeValue("");
    if (compactNumber_) compactNumber_->ChangeValue("");
  }

  void StartDial(const wxString& destination) {
    wxString target = destination;
    target.Trim(true).Trim(false);
    if (target.empty()) return;
    if (number_) number_->ChangeValue(target);
    if (compactNumber_) compactNumber_->ChangeValue(target);
    pendingDialRequestId_ = Send("dial", {target.ToStdString()});
  }

  void HandleBackendMessage(const Json& message) {
    if (!message.is_object() || !message.contains("type")) return;
    const auto type = S(message["type"]);
    if (type == "snapshot" && message.contains("snapshot")) {
      const bool hadCall = HasCall();
      snapshot_ = message["snapshot"].is_object() ? message["snapshot"] : Json::object();
      if (hadCall && !HasCall()) {
        ClearDialInputs();
        pendingDialRequestId_ = 0;
        dialResultTimer_.Stop();
      } else if (HasCall()) {
        dialResultTimer_.Stop();
      }
      engine_ = message.value("engine", Json::object());
      UpdateInterface();
    } else if (type == "result") {
      const auto requestId = message.value("id", 0ULL);
      if (requestId == pendingDialRequestId_) {
        if (!message.value("ok", false)) {
          ClearDialInputs();
          pendingDialRequestId_ = 0;
          dialResultTimer_.Stop();
        } else if (!HasCall()) {
          dialResultTimer_.StartOnce(1500);
        }
      } else if (requestId == audioRefreshRequestId_) {
        audioRefreshRequestId_ = 0;
        if (message.value("ok", false)) {
          snapshot_["audioDevices"] = message.value("value", Json::array());
          CallAfter([this]() { ShowAudioSettings(); });
        } else {
          SetEngineStatus(engine_.value("running", false), S(message.value("error", Json("Não foi possível atualizar o áudio."))));
        }
      } else if (message.value("ok", true) == false) {
        SetEngineStatus(engine_.value("running", false), S(message.value("error", Json("Operação não concluída."))));
      }
    } else if (type == "show") {
      Show(true);
      Raise();
      SetFocus();
    }
  }

  void UpdateInterface() {
    RebuildCenterPage();
    UpdateNavigationSelection();
    bool incomingRinging = false;
    std::string incomingCallId;
    if (HasCall()) {
      const auto& incoming = snapshot_["call"];
      incomingRinging = S(incoming.value("direction", Json(""))) == "incoming" &&
                        S(incoming.value("state", Json(""))) == "ringing";
      if (incomingRinging) incomingCallId = S(incoming.value("id", Json(""))).ToStdString();
    }
    if (incomingRinging && incomingPopupCallId_ != incomingCallId &&
        (!IsShown() || IsIconized() || !IsActive())) {
      incomingPopupCallId_ = incomingCallId;
      compactNumber_->ChangeValue(number_->GetValue());
      compact_ = true;
      compactToggle_->SetLabel(U("Expandir"));
      compactLayoutInitialized_ = false;
      SetMinSize(wxSize(360, 320));
      Show(true);
      if (IsIconized()) Iconize(false);
      Raise();
      SetFocus();
      RequestUserAttention(wxUSER_ATTENTION_INFO);
    } else if (!incomingRinging) {
      incomingPopupCallId_.clear();
    }
    const auto accounts = snapshot_.value("accounts", Json::array());
    const auto selected = S(snapshot_.value("selectedAccountId", Json(nullptr)));
    Json selectedAccount;
    wxString compactAccountState = U("Offline");
    for (const auto& account : accounts) {
      if (S(account.value("id", Json(nullptr))) == selected) { selectedAccount = account; break; }
    }
    if (!engine_.value("running", false)) {
      SetEngineStatus(false, S(engine_.value("error", Json("Motor SIP indisponível"))));
    } else if (selectedAccount.is_object()) {
      const auto state = S(selectedAccount.value("state", Json("offline")));
      compactAccountState = state == "registered" ? U("Conectado") : StateLabel(state);
      const auto label = S(selectedAccount.value("label", Json("")));
      const auto user = S(selectedAccount.value("username", Json("")));
      const auto domain = S(selectedAccount.value("domain", Json("")));
      const auto detail = S(selectedAccount.value("detail", Json("")));
      wxString status = label + "  ·  " + StateLabel(state);
      if (!user.empty()) status += "  ·  " + user + "@" + domain;
      if (!detail.empty()) status += "  ·  " + detail;
      SetEngineStatus(state == "registered", status);
    } else if (accounts.empty()) {
      SetEngineStatus(false, U("Nenhuma conta SIP cadastrada. Abra Configurações."));
    } else {
      SetEngineStatus(false, U("Selecione uma conta em Configurações."));
    }

    const bool hasCall = HasCall();
    maximizeWindowButton_->Show(!compact_);
    recentPanel_->Show(!hasCall && !compact_);
    callPanel_->Show(hasCall && !compact_);
    dialerPanel_->Show(!compact_);
    navigationPanel_->Show(!compact_);
    compactPanel_->Show(compact_);
    compactDialPanel_->Show(compact_ && !hasCall);
    compactCallPanel_->Show(compact_ && hasCall);
    if (hasCall) {
      const auto call = snapshot_["call"];
      callName_->SetLabel(DisplayCaller(call));
      const auto state = S(call.value("state", Json("connecting")));
      const auto direction = S(call.value("direction", Json("outgoing")));
      callState_->SetLabel(CallStateText(state, direction));
      const bool ringing = state == "ringing" && direction == "incoming";
      compactCallName_->SetLabel(callName_->GetLabel());
      compactCallStatus_->SetLabel(CallStateText(state, direction));
      compactCallAccount_->SetLabel(compactAccountState);
      compactMuteButton_->SetLabel(call.value("muted", false) ? U("Ativar áudio") : U("Mudo"));
      compactHoldButton_->SetLabel(call.value("held", false) ? U("Retomar") : U("Espera"));
      compactAnswerButton_->Show(ringing);
      compactRejectButton_->Show(ringing);
      compactHangupButton_->Show(!ringing);
      compactMuteButton_->Show(!ringing);
      compactHoldButton_->Show(!ringing);
      compactTransferButton_->Show(!ringing);
      compactDtmfButton_->Show(!ringing);
      if (ringing) {
        compactDtmfPanel_->Hide();
        compactDtmfButton_->SetLabel(U("Teclado"));
      }
      answerButton_->Show(ringing);
      rejectButton_->Show(ringing);
      muteButton_->Show(!ringing);
      holdButton_->Show(!ringing);
      transferButton_->Show(!ringing);
      hangupButton_->Show(!ringing);
      muteButton_->SetLabel(call.value("muted", false) ? U("Ativar áudio") : U("Silenciar"));
      holdButton_->SetLabel(call.value("held", false) ? U("Retomar") : U("Espera"));
      dialButton_->Enable(false);
      UpdateCallDuration();
    } else {
      callDuration_->SetLabel("00:00");
      compactCallDuration_->SetLabel("00:00");
      compactDtmfPanel_->Hide();
      compactDtmfButton_->SetLabel(U("Teclado"));
      dialButton_->Enable(!accounts.empty() && engine_.value("running", false));
    }
    if (compact_) {
      compactStatus_->SetLabel(compactAccountState);
      compactAction_->Enable(!accounts.empty() && engine_.value("running", false));
    }
    if (compact_ && (!compactLayoutInitialized_ || compactCallView_ != hasCall)) {
      compactCallView_ = hasCall;
      compactLayoutInitialized_ = true;
      FitCompactWindow();
    } else {
      Layout();
    }
  }

  void FitCompactWindow() {
    if (!GetSizer()) return;
    Layout();
    const wxSize best = GetSizer()->CalcMin();
    const int width = std::max(390, best.GetWidth());
    const int height = std::max(320, best.GetHeight());
    SetMinSize(wxSize(width, height));
    SetClientSize(width, height);
    Layout();
  }

  wxString CallStateText(const wxString& state, const wxString& direction) const {
    if (state == "ringing" && direction == "incoming") return U("Chamada recebida");
    if (state == "ringing") return U("Chamando…");
    if (state == "connecting" || state == "early-media") return U("Conectando…");
    if (state == "held") return U("Em espera");
    if (state == "active") return U("Em chamada");
    if (state == "failed") return U("Chamada não completada");
    return U("Encerrando chamada");
  }

  void SetEngineStatus(bool ready, const wxString& value) {
    lineStatus_->SetLabel(value);
    lineStatus_->SetForegroundColour(ready ? kBrand : kMuted);
    if (compactStatus_) compactStatus_->SetLabel(value);
    Layout();
  }

  void OnDial(wxCommandEvent&) {
    if (HasCall()) {
      const auto& call = snapshot_["call"];
      const auto state = S(call.value("state", Json("")));
      if (state == "ringing" && S(call.value("direction", Json(""))) == "incoming")
        Send("answer", {call["id"]});
      else Send("hangup", {call["id"]});
      return;
    }
    auto* dialInput = compact_ ? compactNumber_ : number_;
    const auto destination = dialInput->GetValue().Trim(true).Trim(false);
    if (destination.empty()) return;
    StartDial(destination);
  }

  void TransferCall() {
    if (!HasCall()) return;
    wxTextEntryDialog dialog(this, U("Ramal ou URI SIP de destino"), U("Transferir chamada"));
    if (dialog.ShowModal() == wxID_OK && !dialog.GetValue().Trim(true).Trim(false).empty())
      Send("transfer", {snapshot_["call"]["id"], dialog.GetValue().Trim(true).Trim(false).ToStdString()});
  }

  void ShowAudioSettings() {
    wxDialog dialog(this, wxID_ANY, U("Dispositivos de áudio"), wxDefaultPosition, wxSize(470, 280),
                    wxDEFAULT_DIALOG_STYLE | wxRESIZE_BORDER);
    auto* root = new wxBoxSizer(wxVERTICAL);
    root->Add(Label(&dialog, U("Áudio do sistema"), 16, kInk, true), 0, wxLEFT | wxTOP, 18);
    root->Add(Label(&dialog, U("Escolha os dispositivos usados nas chamadas."), 10, kMuted),
              0, wxLEFT | wxRIGHT | wxTOP, 18);
    auto* grid = new wxFlexGridSizer(2, 10, 10);
    grid->AddGrowableCol(1, 1);
    auto* input = new wxChoice(&dialog, wxID_ANY);
    auto* output = new wxChoice(&dialog, wxID_ANY);
    std::vector<std::string> inputIds;
    std::vector<std::string> outputIds;
    for (const auto& device : snapshot_.value("audioDevices", Json::array())) {
      const auto id = S(device.value("id", Json(nullptr))).ToStdString();
      const auto label = S(device.value("label", Json("Dispositivo de áudio")));
      const auto kind = S(device.value("kind", Json("")));
      if (kind == "input") { input->Append(label); inputIds.push_back(id); }
      if (kind == "output") { output->Append(label); outputIds.push_back(id); }
    }
    if (inputIds.empty()) { input->Append(U("Padrão do sistema")); inputIds.push_back("pulse,default"); }
    if (outputIds.empty()) { output->Append(U("Padrão do sistema")); outputIds.push_back("pulse,default"); }
    auto selectId = [](wxChoice* choice, const std::vector<std::string>& ids, const Json& current) {
      const auto selected = S(current).ToStdString();
      auto found = std::find(ids.begin(), ids.end(), selected);
      choice->SetSelection(found == ids.end() ? 0 : static_cast<int>(std::distance(ids.begin(), found)));
    };
    selectId(input, inputIds, snapshot_.value("inputDeviceId", Json(nullptr)));
    selectId(output, outputIds, snapshot_.value("outputDeviceId", Json(nullptr)));
    grid->Add(Label(&dialog, U("Microfone"), 11, kMuted), 0, wxALIGN_CENTER_VERTICAL);
    grid->Add(input, 1, wxEXPAND);
    grid->Add(Label(&dialog, U("Saída de áudio"), 11, kMuted), 0, wxALIGN_CENTER_VERTICAL);
    grid->Add(output, 1, wxEXPAND);
    root->Add(grid, 1, wxEXPAND | wxALL, 18);
    auto* refresh = new wxButton(&dialog, wxID_REFRESH, U("Atualizar dispositivos"));
    auto* cancel = new wxButton(&dialog, wxID_CANCEL, U("Cancelar"));
    auto* apply = new wxButton(&dialog, wxID_OK, U("Aplicar"));
    for (auto* button : {refresh, cancel, apply}) {
      button->SetMinSize(wxSize(-1, kActionHeight));
      button->SetFont(wxFont(kActionFont, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_MEDIUM));
    }
    refresh->Bind(wxEVT_BUTTON, [&dialog](wxCommandEvent&) { dialog.EndModal(wxID_REFRESH); });
    auto* buttonGrid = new wxGridSizer(1, 3, 8, 8);
    buttonGrid->Add(refresh, 1, wxEXPAND);
    buttonGrid->Add(cancel, 1, wxEXPAND);
    buttonGrid->Add(apply, 1, wxEXPAND);
    root->Add(buttonGrid, 0, wxEXPAND | wxLEFT | wxRIGHT | wxBOTTOM, 18);
    dialog.SetSizer(root);
    const auto result = dialog.ShowModal();
    if (result == wxID_REFRESH) {
      audioRefreshRequestId_ = Send("refreshAudioDevices");
      return;
    }
    if (result != wxID_OK) return;
    const auto inputSelection = input->GetSelection();
    const auto outputSelection = output->GetSelection();
    if (inputSelection != wxNOT_FOUND && static_cast<size_t>(inputSelection) < inputIds.size())
      Send("setAudioDevice", {"input", inputIds[static_cast<size_t>(inputSelection)]});
    if (outputSelection != wxNOT_FOUND && static_cast<size_t>(outputSelection) < outputIds.size())
      Send("setAudioDevice", {"output", outputIds[static_cast<size_t>(outputSelection)]});
  }

  void ShowSettings() {
    const auto accounts = snapshot_.value("accounts", Json::array());
    wxDialog dialog(this, wxID_ANY, U("Configurações"), wxDefaultPosition, wxSize(540, 410),
                    wxDEFAULT_DIALOG_STYLE | wxRESIZE_BORDER);
    auto* root = new wxBoxSizer(wxVERTICAL);
    root->Add(Label(&dialog, U("Contas SIP"), 16, kInk, true), 0, wxLEFT | wxTOP, 18);
    auto* list = new wxListBox(&dialog, wxID_ANY);
    std::vector<std::string> ids;
    for (const auto& account : accounts) {
      const auto id = S(account.value("id", Json(nullptr))).ToStdString();
      const auto label = S(account.value("label", Json("Conta")));
      const auto user = S(account.value("username", Json("")));
      const auto domain = S(account.value("domain", Json("")));
      const auto state = StateLabel(S(account.value("state", Json("offline"))));
      list->Append(label + "  ·  " + user + "@" + domain + "  ·  " + state);
      ids.push_back(id);
      if (id == S(snapshot_.value("selectedAccountId", Json(nullptr))).ToStdString())
        list->SetSelection(static_cast<int>(ids.size() - 1));
    }
    root->Add(list, 1, wxEXPAND | wxALL, 18);
    auto* actions = new wxGridSizer(1, 4, 8, 8);
    auto* add = Button(&dialog, U("Adicionar conta"));
    auto* reg = Button(&dialog, U("Registrar"));
    auto* unregister = Button(&dialog, U("Desregistrar"));
    auto* remove = Button(&dialog, U("Remover"));
    for (auto* button : {add, reg, unregister, remove}) actions->Add(button, 1, wxEXPAND);
    root->Add(actions, 0, wxLEFT | wxRIGHT | wxBOTTOM, 18);
    auto* close = new wxButton(&dialog, wxID_OK, U("Fechar"));
    close->SetMinSize(wxSize(100, kActionHeight));
    close->SetFont(wxFont(kActionFont, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_MEDIUM));
    root->Add(close, 0, wxALIGN_RIGHT | wxLEFT | wxRIGHT | wxBOTTOM, 18);
    dialog.SetSizer(root);

    auto selectedId = [&]() -> std::string {
      const auto index = list->GetSelection();
      return index != wxNOT_FOUND && static_cast<size_t>(index) < ids.size() ? ids[static_cast<size_t>(index)] : "";
    };
    list->Bind(wxEVT_LISTBOX, [this, &selectedId](wxCommandEvent&) {
      const auto id = selectedId();
      if (!id.empty()) Send("selectAccount", {id});
    });
    add->Bind(wxEVT_BUTTON, [this, &dialog](wxCommandEvent&) {
      AccountForm form(&dialog);
      if (form.ShowModal() == wxID_OK) Send("saveAccount", {form.Draft()});
    });
    reg->Bind(wxEVT_BUTTON, [this, &selectedId](wxCommandEvent&) {
      const auto id = selectedId(); if (!id.empty()) Send("register", {id});
    });
    unregister->Bind(wxEVT_BUTTON, [this, &selectedId](wxCommandEvent&) {
      const auto id = selectedId(); if (!id.empty()) Send("unregister", {id});
    });
    remove->Bind(wxEVT_BUTTON, [this, &dialog, &selectedId](wxCommandEvent&) {
      const auto id = selectedId();
      if (id.empty()) return;
      if (wxMessageBox(U("Remover esta conta do easyphone?"), U("Remover conta"),
                       wxYES_NO | wxNO_DEFAULT | wxICON_QUESTION, &dialog) == wxYES)
        Send("removeAccount", {id});
    });
    dialog.ShowModal();
  }

  void ToggleCompact() {
    if (compact_) number_->ChangeValue(compactNumber_->GetValue());
    else compactNumber_->ChangeValue(number_->GetValue());
    compact_ = !compact_;
    compactToggle_->SetLabel(compact_ ? U("Expandir") : U("Compacto"));
    maximizeWindowButton_->Show(!compact_);
    compactLayoutInitialized_ = false;
    if (compact_) {
      SetMinSize(wxSize(360, 320));
      UpdateInterface();
    } else {
      SetMinSize(wxSize(920, 600));
      SetClientSize(wxSize(1080, 700));
      UpdateInterface();
    }
    Layout();
  }

  void UpdateCallDuration() {
    if (!HasCall()) return;
    const auto startedAt = snapshot_["call"].value("startedAt", Json(nullptr));
    if (!startedAt.is_number()) {
      callDuration_->SetLabel("00:00");
      compactCallDuration_->SetLabel("00:00");
      return;
    }
    const auto elapsed = std::max<long long>(0, wxGetUTCTimeMillis().GetValue() - startedAt.get<long long>()) / 1000;
    const auto formatted = wxString::Format("%02lld:%02lld", elapsed / 60, elapsed % 60);
    callDuration_->SetLabel(formatted);
    compactCallDuration_->SetLabel(formatted);
  }

  void OnTimer(wxTimerEvent&) { UpdateCallDuration(); }

  void OnDialResultTimeout(wxTimerEvent&) {
    if (pendingDialRequestId_ && !HasCall()) {
      ClearDialInputs();
      pendingDialRequestId_ = 0;
    }
  }

  void OnClose(wxCloseEvent& event) {
    if (event.CanVeto()) { Hide(); event.Veto(); }
    else event.Skip();
  }

};

class easyphoneApp final : public wxApp {
 public:
  bool OnInit() override {
    wxInitAllImageHandlers();
    frame_ = new PhoneFrame();
    frame_->Show();
    frame_->StartReader();
    return true;
  }

  int OnExit() override {
    if (frame_) frame_->Hide();
    return wxApp::OnExit();
  }

 private:
  PhoneFrame* frame_{};
};

wxIMPLEMENT_APP(easyphoneApp);
