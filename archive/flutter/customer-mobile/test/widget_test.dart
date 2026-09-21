import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:afhomes_customer/main.dart';

void main() {
  testWidgets('renders customer authentication', (tester) async {
    FlutterSecureStorage.setMockInitialValues({});
    await tester.pumpWidget(const App());
    await tester.pumpAndSettle();
    expect(find.text('AFhomes VIP'), findsOneWidget);
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Create customer account'), findsOneWidget);
  });
}
