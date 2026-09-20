import 'package:flutter_test/flutter_test.dart';
import 'package:afhomes_staff/main.dart';
void main(){testWidgets('renders staff identification actions',(tester)async{await tester.pumpWidget(const App());expect(find.text('AFhomes Staff POS'),findsOneWidget);expect(find.text('Scan printed QR'),findsOneWidget);expect(find.text('Read NFC'),findsOneWidget);expect(find.text('Enter member code'),findsOneWidget);});}
